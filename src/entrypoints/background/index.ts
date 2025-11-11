import { registerCategorizationService } from "@/lib/ai/categorization-service";
import { registerAuthService } from "@/lib/auth/auth-service";
import { registerAutofillService } from "@/lib/autofill/autofill-service";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import {
  getSessionService,
  registerSessionService,
} from "@/lib/autofill/session-service";
import { createLogger } from "@/lib/logger";
import { tracerProvider } from "@/lib/observability/langfuse";
import { registerModelService } from "@/lib/providers/model-service";
import { registerKeyValidationService } from "@/lib/security/key-validation-service";
import { registerSyncService } from "@/lib/sync/sync-service";

const logger = createLogger("background");

export default defineBackground(() => {
  tracerProvider.register();
  registerCategorizationService();
  registerKeyValidationService();
  registerModelService();
  registerAutofillService();
  registerSessionService();
  registerAuthService();
  registerSyncService();

  const sessionService = getSessionService();

  setTimeout(() => {
    logger.info("Checking auth status for startup sync");

    import("@/stores/auth").then(({ useAuthStore }) => {
      const authStore = useAuthStore.getState();

      authStore.checkAuthStatus().then((isAuthenticated) => {
        if (isAuthenticated) {
          logger.info("User authenticated, triggering startup sync");

          authStore.getAuthToken().then((token) => {
            if (token) {
              import("@/lib/sync/sync-service").then(({ getSyncService }) => {
                const syncService = getSyncService();

                syncService
                  .setAuthToken(token)
                  .then(() => {
                    import("@/lib/sync/auto-sync-manager").then(
                      ({ autoSyncManager }) => {
                        autoSyncManager.triggerSync("full", { silent: true });
                      },
                    );
                  })
                  .catch((error) => {
                    logger.error(
                      "Failed to initialize sync service on startup",
                      { error },
                    );
                  });
              });
            }
          });
        } else {
          logger.info("User not authenticated, skipping startup sync");
        }
      });
    });
  }, 3000); // Wait 3 seconds for extension to stabilize

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      logger.info("Extension installed for the first time, opening settings");
      browser.runtime.openOptionsPage();
    }
  });

  contentAutofillMessaging.onMessage("startSession", async () => {
    return sessionService.startSession();
  });

  contentAutofillMessaging.onMessage(
    "updateSessionStatus",
    async ({ data }) => {
      return sessionService.updateSessionStatus(data.sessionId, data.status);
    },
  );

  contentAutofillMessaging.onMessage("completeSession", async ({ data }) => {
    return sessionService.completeSession(data.sessionId);
  });

  contentAutofillMessaging.onMessage(
    "incrementMemoryUsage",
    async ({ data }) => {
      return sessionService.incrementMemoryUsage(data.memoryIds);
    },
  );

  contentAutofillMessaging.onMessage("saveFormMappings", async ({ data }) => {
    return sessionService.saveFormMappings(data.sessionId, data.formMappings);
  });

  logger.info("Background script initialized with all services");
});
