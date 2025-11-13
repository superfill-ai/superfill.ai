import { createLogger } from "@/lib/logger";
import { autoSyncManager } from "@/lib/sync/auto-sync-manager";
import { getSyncService } from "@/lib/sync/sync-service";
import { useAuthStore } from "@/stores/auth";

const logger = createLogger("startup-sync");

export async function handleStartupSync(): Promise<void> {
  try {
    logger.info("Checking auth status for startup sync");

    const authStore = useAuthStore.getState();
    const isAuthenticated = await authStore.checkAuthStatus();

    if (!isAuthenticated) {
      logger.info("User not authenticated, skipping startup sync");
      return;
    }

    const token = await authStore.getAuthToken();

    if (!token) {
      logger.warn("Auth check passed but no token found");
      return;
    }

    logger.info("User authenticated, initializing sync");

    const syncService = getSyncService();
    await syncService.setAuthToken(token);

    await autoSyncManager.triggerSync("full", { silent: true });

    logger.info("Startup sync initiated successfully");
  } catch (error) {
    logger.error("Failed to handle startup sync", { error });
  }
}
