import type { User } from "@supabase/supabase-js";
import { defineProxyService } from "@webext-core/proxy-service";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

import type { MemoryEntry } from "@/types/memory";
import type { SyncOperationResult } from "@/types/sync";
import { getAuthService } from "../auth/auth-service";
import { supabase } from "../supabase/client";
import { autoSyncManager } from "./auto-sync-manager";

const logger = createLogger("sync-service");

class SyncService {
  private syncInProgress = false;

  async performStartupSync(): Promise<void> {
    try {
      logger.debug("Checking auth status for startup sync");

      const authService = getAuthService();
      const session = await authService.getSession();

      if (!session) {
        logger.debug("User not authenticated, skipping startup sync");
        return;
      }

      logger.debug("User authenticated, initializing sync");

      await autoSyncManager.triggerSync("full", { silent: true });

      logger.debug("Startup sync initiated successfully");
    } catch (error) {
      logger.error("Failed to handle startup sync", { error });
    }
  }

  async performFullSync(silent = false): Promise<SyncOperationResult> {
    if (this.syncInProgress) {
      const error = "Sync already in progress";

      if (silent) {
        logger.debug(error);
        return {
          success: false,
          operation: "full_sync",
          itemsSynced: 0,
          conflictsResolved: 0,
          errors: [error],
          timestamp: new Date().toISOString(),
        };
      }
      throw new Error(error);
    }

    const authService = getAuthService();
    const authenticated = await authService.isAuthenticated();

    if (!authenticated) {
      const error = "Cannot perform sync: not authenticated";

      if (silent) {
        logger.debug(error);
        return {
          success: false,
          operation: "full_sync",
          itemsSynced: 0,
          conflictsResolved: 0,
          errors: [error],
          timestamp: new Date().toISOString(),
        };
      }
      throw new Error(error);
    }

    this.syncInProgress = true;
    const errors: string[] = [];
    let itemsSynced = 0;
    let conflictsResolved = 0;

    try {
      logger.debug("Starting full sync");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("No authenticated user found");
      }

      const syncState = await storage.syncStateAndSettings.getValue();
      const lastSyncTimestamp = syncState?.lastSync
        ? syncState.lastSync
        : undefined;

      const pullResult = await this.pullFromRemote(lastSyncTimestamp, user);
      itemsSynced += pullResult.itemsSynced;
      conflictsResolved += pullResult.conflictsResolved;
      errors.push(...pullResult.errors);

      const pushResult = await this.pushToRemote(user);
      itemsSynced += pushResult.itemsSynced;
      conflictsResolved += pushResult.conflictsResolved;
      errors.push(...pushResult.errors);

      await storage.syncStateAndSettings.setValue({
        lastSync: new Date().toISOString(),
        conflictResolution: syncState?.conflictResolution || "newest",
        status: errors.length > 0 ? "error" : "synced",
      });

      await supabase.from("sync_logs").insert({
        user_id: user.id,
        operation: "full_sync",
        status: errors.length > 0 ? "error" : "success",
        item_count: itemsSynced,
        conflicts_resolved: conflictsResolved,
        error_message: errors.length > 0 ? errors.join("; ") : null,
        conflict_resolution_strategy: syncState?.conflictResolution || "newest",
      });

      logger.debug("Full sync completed", {
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

      await storage.syncStateAndSettings.setValue({
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
    lastSyncTimestamp?: string,
    cachedUser?: User,
  ): Promise<SyncOperationResult> {
    const errors: string[] = [];
    let itemsSynced = 0;
    let conflictsResolved = 0;
    let user = cachedUser;

    if (!user) {
      const { data } = await supabase.auth.getUser();
      user = data.user ?? undefined;
    }

    try {
      logger.debug("Pulling data from remote", { lastSyncTimestamp });

      if (!user) {
        throw new Error("No authenticated user found");
      }

      const { data: remoteMemories, error: fetchError } = await supabase.rpc(
        "get_memories_since",
        {
          since_timestamp: lastSyncTimestamp,
        },
      );

      if (fetchError) {
        throw new Error(`Failed to fetch memories: ${fetchError.message}`);
      }

      const localMemories = (await storage.memories.getValue()) || [];
      const syncState = await storage.syncStateAndSettings.getValue();
      const conflictResolution = syncState?.conflictResolution || "newest";

      const memoryMap = new Map(localMemories.map((m) => [m.id, m]));

      for (const remoteMemory of remoteMemories || []) {
        const localMemory = memoryMap.get(remoteMemory.local_id);

        if (!localMemory) {
          const newMemory: MemoryEntry = {
            id: remoteMemory.local_id,
            syncId: remoteMemory.local_id,
            question: remoteMemory.question || undefined,
            answer: remoteMemory.answer,
            category: remoteMemory.category as MemoryEntry["category"],
            tags: remoteMemory.tags,
            confidence: Number(remoteMemory.confidence),
            embedding: remoteMemory.embedding
              ? remoteMemory.embedding
                  .replace(/[[\]]/g, "")
                  .split(",")
                  .map(Number)
              : undefined,
            metadata: {
              createdAt: remoteMemory.created_at,
              updatedAt: remoteMemory.updated_at,
              source: remoteMemory.source as "manual" | "import",
            },
          };
          localMemories.push(newMemory);
          itemsSynced++;
        } else {
          const localUpdatedAt = new Date(
            localMemory.metadata.updatedAt,
          ).getTime();
          const remoteUpdatedAt = new Date(remoteMemory.updated_at).getTime();

          if (remoteUpdatedAt > localUpdatedAt) {
            if (
              conflictResolution === "newest" ||
              conflictResolution === "remote"
            ) {
              const index = localMemories.findIndex(
                (m) => m.id === localMemory.id,
              );
              localMemories[index] = {
                id: remoteMemory.local_id,
                syncId: remoteMemory.local_id,
                question: remoteMemory.question || undefined,
                answer: remoteMemory.answer,
                category: remoteMemory.category as MemoryEntry["category"],
                tags: remoteMemory.tags,
                confidence: Number(remoteMemory.confidence),
                embedding: remoteMemory.embedding
                  ? remoteMemory.embedding
                      .replace(/[[\]]/g, "")
                      .split(",")
                      .map(Number)
                  : undefined,
                metadata: {
                  createdAt: remoteMemory.created_at,
                  updatedAt: remoteMemory.updated_at,
                  source: remoteMemory.source as "manual" | "import",
                },
              };
              conflictsResolved++;
              itemsSynced++;
            }
          } else if (remoteUpdatedAt < localUpdatedAt) {
            if (conflictResolution === "local") {
              conflictsResolved++;
            }
          }
        }

        if (remoteMemory.is_deleted) {
          const index = localMemories.findIndex(
            (m) => m.id === remoteMemory.local_id,
          );
          if (index !== -1) {
            localMemories.splice(index, 1);
            itemsSynced++;
          }
        }
      }

      await storage.memories.setValue(localMemories);

      await supabase.from("sync_logs").insert({
        user_id: user.id,
        operation: "pull",
        status: "success",
        item_count: itemsSynced,
        conflicts_resolved: conflictsResolved,
        conflict_resolution_strategy: conflictResolution,
      });

      logger.debug("Pull completed", { itemsSynced, conflictsResolved });

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

      if (user) {
        await supabase.from("sync_logs").insert({
          user_id: user.id,
          operation: "pull",
          status: "error",
          item_count: itemsSynced,
          conflicts_resolved: conflictsResolved,
          error_message: error instanceof Error ? error.message : "Pull failed",
        });
      }

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

  async pushToRemote(cachedUser?: User): Promise<SyncOperationResult> {
    const errors: string[] = [];
    let itemsSynced = 0;
    const conflictsResolved = 0;
    let user = cachedUser;

    if (!user) {
      const { data } = await supabase.auth.getUser();
      user = data.user ?? undefined;
    }

    try {
      logger.debug("Pushing data to remote");

      if (!user) {
        throw new Error("No authenticated user found");
      }

      const localMemories = (await storage.memories.getValue()) || [];

      for (const memory of localMemories) {
        try {
          const { error } = await supabase.rpc("upsert_memory", {
            p_local_id: memory.id,
            p_question: (memory.question || null) as string,
            p_answer: memory.answer,
            p_category: memory.category,
            p_tags: memory.tags || [],
            p_confidence: memory.confidence,
            p_embedding: (memory.embedding && memory.embedding.length > 0
              ? `[${memory.embedding.join(",")}]`
              : null) as string,
            p_source: memory.metadata.source,
            p_created_at: memory.metadata.createdAt,
            p_updated_at: memory.metadata.updatedAt,
          });

          if (error) {
            logger.error(
              `Failed to sync memory ${memory.id}: ${error.message}`,
            );
            errors.push(`Failed to sync memory ${memory.id}: ${error.message}`);
          } else {
            itemsSynced++;
          }
        } catch (memoryError) {
          const errorMsg =
            memoryError instanceof Error
              ? memoryError.message
              : "Unknown error";
          errors.push(`Failed to sync memory ${memory.id}: ${errorMsg}`);
        }
      }

      await supabase.from("sync_logs").insert({
        user_id: user.id,
        operation: "push",
        status: errors.length > 0 ? "partial" : "success",
        item_count: itemsSynced,
        conflicts_resolved: conflictsResolved,
        error_message: errors.length > 0 ? errors.join("; ") : null,
      });

      logger.debug("Push completed", {
        itemsSynced,
        conflictsResolved,
        errors: errors.length,
      });

      return {
        success: errors.length === 0,
        operation: "push",
        itemsSynced,
        conflictsResolved,
        errors,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Push failed", { error });
      errors.push(error instanceof Error ? error.message : "Push failed");

      if (user) {
        await supabase.from("sync_logs").insert({
          user_id: user.id,
          operation: "push",
          status: "error",
          item_count: itemsSynced,
          conflicts_resolved: conflictsResolved,
          error_message: error instanceof Error ? error.message : "Push failed",
        });
      }

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
      logger.debug("Syncing AI settings");

      const aiSettings = await storage.aiSettings.getValue();

      if (!aiSettings) {
        logger.warn("No AI settings to sync");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("No authenticated user found");
      }

      const { error } = await supabase
        .from("users")
        .update({
          settings: {
            autoFillEnabled: aiSettings.autoFillEnabled,
            confidenceThreshold: aiSettings.confidenceThreshold,
            selectedProvider: aiSettings.selectedProvider,
          },
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) {
        throw new Error(`Failed to sync AI settings: ${error.message}`);
      }

      logger.debug("AI settings synced successfully");
    } catch (error) {
      logger.error("Failed to sync AI settings", { error });
      throw error;
    }
  }

  isSyncInProgress(): boolean {
    return this.syncInProgress;
  }
}

export const [registerSyncService, getSyncService] = defineProxyService(
  "SyncService",
  () => new SyncService(),
);
