import { createLogger } from "@/lib/logger";
import type { SyncOperationResult } from "@/types/sync";
import { getAuthService } from "../auth/auth-service";
import { getSyncService } from "./sync-service";

const logger = createLogger("auto-sync-manager");

type SyncType = "push" | "pull" | "full";

interface SyncOptions {
  delay?: number;
  silent?: boolean;
}

class AutoSyncManager {
  private debouncedPushTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 5000; // 5 seconds

  async triggerSync(type: SyncType, options: SyncOptions = {}): Promise<void> {
    const { delay = 0, silent = true } = options;

    try {
      const authService = getAuthService();

      if (!authService.isAuthenticated()) {
        logger.debug("Skipping auto-sync: Not authenticated");
        return;
      }

      const syncService = getSyncService();
      const isSyncing = await syncService.isSyncInProgress();

      if (isSyncing) {
        logger.debug("Skipping auto-sync: Sync already in progress");
        return;
      }

      const executeSync = async () => {
        logger.debug(`Triggering ${type} sync`, { silent, delay });

        let result: SyncOperationResult;
        switch (type) {
          case "push":
            result = await syncService.pushToRemote();
            break;
          case "pull":
            result = await syncService.pullFromRemote(undefined);
            break;
          case "full":
            result = await syncService.performFullSync(silent);
            break;
        }

        if (result.success) {
          logger.debug(`${type} sync completed successfully`, {
            itemsSynced: result.itemsSynced,
            conflictsResolved: result.conflictsResolved,
          });
        } else if (!silent) {
          logger.error(`${type} sync failed`, { errors: result.errors });
        }
      };

      if (delay > 0) {
        setTimeout(executeSync, delay);
      } else {
        await executeSync();
      }
    } catch (error) {
      logger.error("Failed to trigger auto-sync", { error });
      if (!silent) {
        throw error;
      }
    }
  }

  triggerDebouncedPush(): void {
    if (this.debouncedPushTimer) {
      clearTimeout(this.debouncedPushTimer);
    }

    this.debouncedPushTimer = setTimeout(() => {
      this.triggerSync("push", { silent: true }).catch((error) => {
        logger.error("Debounced push sync failed", { error });
      });
      this.debouncedPushTimer = null;
    }, this.DEBOUNCE_DELAY);

    logger.debug("Push sync debounced", {
      delay: this.DEBOUNCE_DELAY,
    });
  }

  cancelDebouncedPush(): void {
    if (this.debouncedPushTimer) {
      clearTimeout(this.debouncedPushTimer);
      this.debouncedPushTimer = null;
      logger.debug("Debounced push sync cancelled");
    }
  }
}

const autoSyncManager = new AutoSyncManager();

export { autoSyncManager };
