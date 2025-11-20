import { useCallback, useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { getSyncService } from "@/lib/sync/sync-service";
import type { SyncOperationResult } from "@/types/sync";

const logger = createLogger("hook:sync");

const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

type SyncState = {
  syncing: boolean;
  lastSync: string | null;
  canSync: boolean;
  timeUntilNextSync: number;
  syncStatus: "pending" | "synced" | "error" | null;
  error: string | null;
};

type SyncActions = {
  performSync: () => Promise<SyncOperationResult | null>;
  checkSyncStatus: () => Promise<void>;
};

export function useSync(): SyncState & SyncActions {
  const [state, setState] = useState<SyncState>({
    syncing: false,
    lastSync: null,
    canSync: false,
    timeUntilNextSync: 0,
    syncStatus: null,
    error: null,
  });

  const checkSyncStatus = useCallback(async () => {
    try {
      const syncState = await storage.syncStateAndSettings.getValue();
      const lastSync = syncState?.lastSync || null;
      const syncStatus = syncState?.status || null;

      if (lastSync) {
        const lastSyncTime = new Date(lastSync).getTime();
        const now = Date.now();
        const timeSinceLastSync = now - lastSyncTime;
        const canSync = timeSinceLastSync >= SYNC_COOLDOWN_MS;
        const timeUntilNextSync = canSync
          ? 0
          : SYNC_COOLDOWN_MS - timeSinceLastSync;

        setState((prev) => ({
          ...prev,
          lastSync,
          canSync,
          timeUntilNextSync,
          syncStatus,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          lastSync,
          canSync: true,
          timeUntilNextSync: 0,
          syncStatus,
        }));
      }
    } catch (error) {
      logger.error("Failed to check sync status", error);
    }
  }, []);

  const performSync = useCallback(async () => {
    if (state.syncing || !state.canSync) {
      logger.warn("Sync already in progress or cooldown active");
      return null;
    }

    setState((prev) => ({ ...prev, syncing: true, error: null }));

    try {
      const syncService = getSyncService();
      const result = await syncService.performFullSync();

      setState((prev) => ({
        ...prev,
        syncing: false,
        lastSync: result.timestamp,
        canSync: false,
        timeUntilNextSync: SYNC_COOLDOWN_MS,
        syncStatus: result.success ? "synced" : "error",
        error: result.success ? null : result.errors.join("; "),
      }));

      logger.info("Sync completed", result);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown sync error";

      setState((prev) => ({
        ...prev,
        syncing: false,
        syncStatus: "error",
        error: errorMessage,
      }));

      logger.error("Sync failed", error);
      return null;
    }
  }, [state.syncing, state.canSync]);

  useEffect(() => {
    if (state.timeUntilNextSync > 0) {
      const interval = setInterval(() => {
        setState((prev) => {
          const newTimeUntilNextSync = Math.max(0, prev.timeUntilNextSync - 1000);
          const canSync = newTimeUntilNextSync === 0;

          return {
            ...prev,
            timeUntilNextSync: newTimeUntilNextSync,
            canSync,
          };
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [state.timeUntilNextSync]);

  useEffect(() => {
    checkSyncStatus();

    const unwatch = storage.syncStateAndSettings.watch(() => {
      checkSyncStatus();
    });

    return () => unwatch();
  }, [checkSyncStatus]);

  return {
    ...state,
    performSync,
    checkSyncStatus,
  };
}
