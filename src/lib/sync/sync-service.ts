import { defineProxyService } from "@webext-core/proxy-service";
import { createLogger } from "@/lib/logger";
import { store } from "@/lib/storage";
import type { MemoryEntry } from "@/types/memory";
import type { SyncMemoryEntry, SyncOperationResult } from "@/types/sync";
import { getConvexClient } from "./convex-client";

const logger = createLogger("sync-service");

class SyncService {
  private syncInProgress = false;
  private authToken: string | null = null;

  async setAuthToken(token: string): Promise<void> {
    this.authToken = token;
    const convexClient = getConvexClient();
    await convexClient.initialize(token);
    logger.info("Sync service authenticated");
  }

  clearAuth(): void {
    this.authToken = null;
    const convexClient = getConvexClient();
    convexClient.clearAuth();
    logger.info("Sync service auth cleared");
  }

  isAuthenticated(): boolean {
    return this.authToken !== null && getConvexClient().isInitialized();
  }

  async performFullSync(): Promise<SyncOperationResult> {
    if (this.syncInProgress) {
      throw new Error("Sync already in progress");
    }

    if (!this.isAuthenticated()) {
      throw new Error("Not authenticated. Please login first.");
    }

    this.syncInProgress = true;
    const errors: string[] = [];
    let itemsSynced = 0;
    let conflictsResolved = 0;

    try {
      logger.info("Starting full sync");

      const syncState = await store.syncState.getValue();
      const lastSyncTimestamp = syncState?.lastSync
        ? new Date(syncState.lastSync).getTime()
        : undefined;

      const pullResult = await this.pullFromRemote(lastSyncTimestamp);
      itemsSynced += pullResult.itemsSynced;
      conflictsResolved += pullResult.conflictsResolved;
      errors.push(...pullResult.errors);

      const pushResult = await this.pushToRemote();
      itemsSynced += pushResult.itemsSynced;
      conflictsResolved += pushResult.conflictsResolved;
      errors.push(...pushResult.errors);

      await store.syncState.setValue({
        lastSync: new Date().toISOString(),
        conflictResolution: syncState?.conflictResolution || "newest",
        status: errors.length > 0 ? "error" : "synced",
      });

      logger.info("Full sync completed", {
        itemsSynced,
        conflictsResolved,
        errors: errors.length,
      });

      return {
        success: errors.length === 0,
        operation: "full_sync",
        itemsSynced,
        conflictsResolved,
        errors,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Full sync failed", { error });
      errors.push(error instanceof Error ? error.message : "Unknown error");

      await store.syncState.setValue({
        lastSync: new Date().toISOString(),
        conflictResolution: "newest",
        status: "error",
      });

      return {
        success: false,
        operation: "full_sync",
        itemsSynced,
        conflictsResolved,
        errors,
        timestamp: new Date().toISOString(),
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  async pullFromRemote(
    lastSyncTimestamp?: number,
  ): Promise<SyncOperationResult> {
    const errors: string[] = [];
    let itemsSynced = 0;
    let conflictsResolved = 0;

    try {
      logger.info("Pulling data from remote", { lastSyncTimestamp });

      const convexClient = getConvexClient().getClient();

      // biome-ignore lint/suspicious/noExplicitAny: Convex API string literal type
      const result = (await convexClient.query("memories:pullMemories" as any, {
        lastSyncTimestamp,
      })) as {
        memories: SyncMemoryEntry[];
        deletedMemories?: Array<{ localId: string; deletedAt: number }>;
        timestamp: number;
      };

      const localMemories = (await store.memories.getValue()) || [];
      const syncState = await store.syncState.getValue();
      const conflictResolution = syncState?.conflictResolution || "newest";

      const memoryMap = new Map(localMemories.map((m) => [m.id, m]));

      for (const remoteMemory of result.memories) {
        const localMemory = memoryMap.get(remoteMemory.localId);

        if (!localMemory) {
          const newMemory = this.convertSyncMemoryToLocal(remoteMemory);
          localMemories.push(newMemory);
          itemsSynced++;
        } else {
          const localUpdatedAt = new Date(
            localMemory.metadata.updatedAt,
          ).getTime();
          const remoteUpdatedAt = remoteMemory.metadata.updatedAt;

          if (remoteUpdatedAt > localUpdatedAt) {
            if (
              conflictResolution === "newest" ||
              conflictResolution === "remote"
            ) {
              const index = localMemories.findIndex(
                (m) => m.id === localMemory.id,
              );
              localMemories[index] =
                this.convertSyncMemoryToLocal(remoteMemory);
              conflictsResolved++;
              itemsSynced++;
            }
          } else if (remoteUpdatedAt < localUpdatedAt) {
            if (conflictResolution === "local") {
              conflictsResolved++;
            }
          }
        }
      }

      for (const deletedMemory of result.deletedMemories || []) {
        const index = localMemories.findIndex(
          (m) => m.id === deletedMemory.localId,
        );
        if (index !== -1) {
          localMemories.splice(index, 1);
          itemsSynced++;
        }
      }

      await store.memories.setValue(localMemories);

      logger.info("Pull completed", { itemsSynced, conflictsResolved });

      return {
        success: true,
        operation: "pull",
        itemsSynced,
        conflictsResolved,
        errors,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Pull failed", { error });
      errors.push(error instanceof Error ? error.message : "Pull failed");

      return {
        success: false,
        operation: "pull",
        itemsSynced,
        conflictsResolved,
        errors,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async pushToRemote(): Promise<SyncOperationResult> {
    const errors: string[] = [];
    let itemsSynced = 0;
    let conflictsResolved = 0;

    try {
      logger.info("Pushing data to remote");

      const convexClient = getConvexClient().getClient();
      const localMemories = (await store.memories.getValue()) || [];

      const syncMemories: SyncMemoryEntry[] = localMemories.map((memory) =>
        this.convertLocalMemoryToSync(memory),
      );

      const result = (await convexClient.mutation(
        // biome-ignore lint/suspicious/noExplicitAny: Convex API string literal type
        "memories:pushMemories" as any,
        {
          memories: syncMemories,
        },
      )) as {
        success: boolean;
        created: number;
        updated: number;
        conflicts: number;
        conflictItems?: Array<{ localId: string; reason: string }>;
      };

      itemsSynced = result.created + result.updated;
      conflictsResolved = result.conflicts;

      if (result.conflictItems && result.conflictItems.length > 0) {
        logger.warn("Conflicts detected during push", {
          conflicts: result.conflictItems,
        });
      }

      logger.info("Push completed", { itemsSynced, conflictsResolved });

      return {
        success: true,
        operation: "push",
        itemsSynced,
        conflictsResolved,
        errors,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Push failed", { error });
      errors.push(error instanceof Error ? error.message : "Push failed");

      return {
        success: false,
        operation: "push",
        itemsSynced,
        conflictsResolved,
        errors,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async syncAISettings(): Promise<void> {
    try {
      logger.info("Syncing AI settings");

      // TODO: Implement when Convex has AI settings sync endpoints
      logger.warn("AI settings sync not yet implemented on server");
    } catch (error) {
      logger.error("Failed to sync AI settings", { error });
      throw error;
    }
  }

  private convertSyncMemoryToLocal(syncMemory: SyncMemoryEntry): MemoryEntry {
    return {
      id: syncMemory.localId,
      syncId: syncMemory.localId,
      question: syncMemory.question,
      answer: syncMemory.answer,
      category: syncMemory.category,
      tags: syncMemory.tags,
      confidence: syncMemory.confidence,
      embedding: syncMemory.embedding,
      metadata: {
        createdAt: new Date(syncMemory.metadata.createdAt).toISOString(),
        updatedAt: new Date(syncMemory.metadata.updatedAt).toISOString(),
        source: syncMemory.metadata.source as "manual" | "import",
        usageCount: syncMemory.metadata.usageCount,
        lastUsed: syncMemory.metadata.lastUsed
          ? new Date(syncMemory.metadata.lastUsed).toISOString()
          : undefined,
      },
    };
  }

  private convertLocalMemoryToSync(memory: MemoryEntry): SyncMemoryEntry {
    return {
      localId: memory.id,
      question: memory.question,
      answer: memory.answer,
      category: memory.category,
      tags: memory.tags,
      confidence: memory.confidence,
      embedding: memory.embedding,
      metadata: {
        createdAt: new Date(memory.metadata.createdAt).getTime(),
        updatedAt: new Date(memory.metadata.updatedAt).getTime(),
        source: memory.metadata.source,
        usageCount: memory.metadata.usageCount,
        lastUsed: memory.metadata.lastUsed
          ? new Date(memory.metadata.lastUsed).getTime()
          : undefined,
      },
      isDeleted: false,
      deletedAt: undefined,
    };
  }

  isSyncInProgress(): boolean {
    return this.syncInProgress;
  }
}

export const [registerSyncService, getSyncService] = defineProxyService(
  "SyncService",
  () => new SyncService(),
);
