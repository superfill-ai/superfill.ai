import { createLogger } from "@/lib/logger";
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
      const syncService = getSyncService();

      if (!syncService.isAuthenticated()) {
        logger.debug("Skipping auto-sync: Not authenticated");
        return;
      }

      const isSyncing = await syncService.isSyncInProgress();
      if (isSyncing) {
        logger.debug("Skipping auto-sync: Sync already in progress");
        return;
      }

      const executeSync = async () => {
        try {
          logger.info(`Triggering ${type} sync`, { silent, delay });

          switch (type) {
            case "push":
              await syncService.pushToRemote();
              break;
            case "pull":
              await syncService.pullFromRemote();
              break;
            case "full":
              await syncService.performFullSync();
              break;
          }

          logger.info(`${type} sync completed successfully`);
        } catch (error) {
          if (!silent) {
            throw error;
          }
          logger.error(`Auto-sync failed (${type})`, { error });
        }
      };

      if (delay > 0) {
        setTimeout(executeSync, delay);
      } else {
        executeSync().catch((error) => {
          if (!silent) {
            throw error;
          }
          logger.error("Auto-sync execution failed", { error });
        });
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
