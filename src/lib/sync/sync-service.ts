import type { User } from "@supabase/supabase-js";
import { defineProxyService } from "@webext-core/proxy-service";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { computeContentHash } from "@/lib/storage/content-hash";

import type { MemoryEntry } from "@/types/memory";
import type { SyncOperationResult } from "@/types/sync";
import { getAuthService } from "../auth/auth-service";
import { supabase } from "../supabase/client";

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

      await this.performFullSync(true);

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

      const memoryMap = new Map<string, MemoryEntry>();
      const contentHashMap = new Map<string, MemoryEntry>();

      for (const memory of localMemories) {
        if (!memory.contentHash) {
          memory.contentHash = await computeContentHash(
            memory.question,
            memory.answer,
            memory.category,
          );
        }

        const key = memory.syncId ?? memory.id;
        memoryMap.set(key, memory);

        if (memory.contentHash) {
          contentHashMap.set(memory.contentHash, memory);
        }
      }

      for (const remoteMemory of remoteMemories || []) {
        const localMemory = memoryMap.get(remoteMemory.local_id);
        const remoteContentHash =
          "content_hash" in remoteMemory && remoteMemory.content_hash
            ? remoteMemory.content_hash
            : await computeContentHash(
                remoteMemory.question || undefined,
                remoteMemory.answer,
                remoteMemory.category,
              );

        if (remoteMemory.is_deleted) {
          if (localMemory) {
            memoryMap.delete(remoteMemory.local_id);
            if (localMemory.contentHash) {
              contentHashMap.delete(localMemory.contentHash);
            }
            itemsSynced++;
          } else if (remoteContentHash) {
            const duplicate = contentHashMap.get(remoteContentHash);
            if (duplicate) {
              const duplicateKey = duplicate.syncId ?? duplicate.id;
              memoryMap.delete(duplicateKey);
              contentHashMap.delete(remoteContentHash);
              itemsSynced++;
            }
          }

          continue;
        }
        const duplicateByHash =
          !localMemory && remoteContentHash
            ? contentHashMap.get(remoteContentHash)
            : undefined;

        if (!localMemory && duplicateByHash) {
          const localUpdatedAt = new Date(
            duplicateByHash.metadata.updatedAt,
          ).getTime();
          const remoteUpdatedAt = new Date(remoteMemory.updated_at).getTime();

          if (remoteUpdatedAt > localUpdatedAt) {
            duplicateByHash.question = remoteMemory.question || undefined;
            duplicateByHash.answer = remoteMemory.answer;
            duplicateByHash.category =
              remoteMemory.category as MemoryEntry["category"];
            duplicateByHash.tags = remoteMemory.tags || [];
            duplicateByHash.confidence = Number(remoteMemory.confidence);
            duplicateByHash.embedding = remoteMemory.embedding
              ? remoteMemory.embedding
                  .replace(/[[\]]/g, "")
                  .split(",")
                  .map(Number)
              : undefined;
            duplicateByHash.metadata = {
              createdAt: remoteMemory.created_at,
              updatedAt: remoteMemory.updated_at,
              source: remoteMemory.source as "manual" | "import",
            };
            duplicateByHash.contentHash = remoteContentHash;
            duplicateByHash.syncId = remoteMemory.local_id;
            itemsSynced++;
          } else if (!duplicateByHash.syncId) {
            duplicateByHash.syncId = remoteMemory.local_id;
          }

          conflictsResolved++;
          continue;
        }

        if (!localMemory) {
          const newMemory: MemoryEntry = {
            id: remoteMemory.local_id,
            syncId: remoteMemory.local_id,
            question: remoteMemory.question || undefined,
            answer: remoteMemory.answer,
            category: remoteMemory.category as MemoryEntry["category"],
            tags: remoteMemory.tags || [],
            confidence: Number(remoteMemory.confidence),
            embedding: remoteMemory.embedding
              ? remoteMemory.embedding
                  .replace(/[[\]]/g, "")
                  .split(",")
                  .map(Number)
              : undefined,
            contentHash: remoteContentHash,
            metadata: {
              createdAt: remoteMemory.created_at,
              updatedAt: remoteMemory.updated_at,
              source: remoteMemory.source as "manual" | "import",
            },
          };
          memoryMap.set(remoteMemory.local_id, newMemory);

          if (remoteContentHash) {
            contentHashMap.set(remoteContentHash, newMemory);
          }
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
              const updatedMemory: MemoryEntry = {
                id: localMemory.id,
                syncId: remoteMemory.local_id,
                question: remoteMemory.question || undefined,
                answer: remoteMemory.answer,
                category: remoteMemory.category as MemoryEntry["category"],
                tags: remoteMemory.tags || [],
                confidence: Number(remoteMemory.confidence),
                embedding: remoteMemory.embedding
                  ? remoteMemory.embedding
                      .replace(/[[\]]/g, "")
                      .split(",")
                      .map(Number)
                  : undefined,
                contentHash: remoteContentHash,
                metadata: {
                  createdAt: remoteMemory.created_at,
                  updatedAt: remoteMemory.updated_at,
                  source: remoteMemory.source as "manual" | "import",
                },
              };
              memoryMap.set(remoteMemory.local_id, updatedMemory);

              if (
                localMemory.contentHash &&
                localMemory.contentHash !== remoteContentHash
              ) {
                contentHashMap.delete(localMemory.contentHash);
              }

              if (remoteContentHash) {
                contentHashMap.set(remoteContentHash, updatedMemory);
              }
              conflictsResolved++;
              itemsSynced++;
            }
          } else if (remoteUpdatedAt < localUpdatedAt) {
            if (conflictResolution === "local") {
              conflictsResolved++;
              if (!localMemory.syncId) {
                localMemory.syncId = remoteMemory.local_id;
              }
            }
          }
        }
      }

      await storage.memories.setValue(Array.from(memoryMap.values()));

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
        if (!memory.contentHash) {
          memory.contentHash = await computeContentHash(
            memory.question,
            memory.answer,
            memory.category,
          );
        }
      }

      await storage.memories.setValue(localMemories);

      for (const memory of localMemories) {
        try {
          const { error } = await supabase.rpc("upsert_memory", {
            p_local_id: memory.syncId ?? memory.id,
            p_question: memory.question || undefined,
            p_answer: memory.answer,
            p_category: memory.category,
            p_tags: memory.tags || [],
            p_confidence: memory.confidence,
            p_source: memory.metadata.source,
            p_created_at: memory.metadata.createdAt,
            p_updated_at: memory.metadata.updatedAt,
            p_content_hash: memory.contentHash ?? null,
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

      const deletionResult = await this.processPendingDeletions();

      itemsSynced += deletionResult.synced;
      errors.push(...deletionResult.errors);

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

  private async processPendingDeletions(): Promise<{
    synced: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let synced = 0;

    const pendingDeletions = await storage.pendingDeletions.getValue();

    if (pendingDeletions.length === 0) {
      return { synced, errors };
    }

    logger.debug("Processing pending deletions", {
      count: pendingDeletions.length,
    });

    const successfulDeletions: string[] = [];

    for (const deletion of pendingDeletions) {
      try {
        const { error } = await supabase.rpc("upsert_memory", {
          p_local_id: deletion.localId,
          p_is_deleted: true,
          p_deleted_at: deletion.deletedAt,
          p_content_hash: null,
        });

        if (error) {
          logger.error(
            `Failed to sync deletion ${deletion.localId}: ${error.message}`,
          );
          errors.push(`Failed to delete ${deletion.localId}: ${error.message}`);
        } else {
          successfulDeletions.push(deletion.localId);
          synced++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Failed to delete ${deletion.localId}: ${msg}`);
      }
    }

    if (successfulDeletions.length > 0) {
      const remaining = pendingDeletions.filter(
        (d) => !successfulDeletions.includes(d.localId),
      );
      await storage.pendingDeletions.setValue(remaining);
    }

    logger.debug("Pending deletions processed", {
      synced,
      remaining: pendingDeletions.length - synced,
    });

    return { synced, errors };
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
