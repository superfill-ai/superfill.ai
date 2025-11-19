import { getAuthService } from "@/lib/auth/auth-service";
import { createLogger } from "@/lib/logger";
import { autoSyncManager } from "@/lib/sync/auto-sync-manager";
import { getSyncService } from "@/lib/sync/sync-service";

const logger = createLogger("startup-sync");

export async function handleStartupSync(): Promise<void> {
  try {
    logger.info("Checking auth status for startup sync");

    const authService = getAuthService();
    const session = await authService.getSession();

    if (!session) {
      logger.info("User not authenticated, skipping startup sync");
      return;
    }

    logger.info("User authenticated, initializing sync");

    const syncService = getSyncService();
    await syncService.setAuthToken(session.access_token);

    await autoSyncManager.triggerSync("full", { silent: true });

    logger.info("Startup sync initiated successfully");
  } catch (error) {
    logger.error("Failed to handle startup sync", { error });
  }
}
