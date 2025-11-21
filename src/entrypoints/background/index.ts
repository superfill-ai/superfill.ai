import { registerCategorizationService } from "@/lib/ai/categorization-service";
import { getAuthService, registerAuthService } from "@/lib/auth/auth-service";
import { registerAutofillService } from "@/lib/autofill/autofill-service";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import {
  getSessionService,
  registerSessionService,
} from "@/lib/autofill/session-service";
import { createLogger, DEBUG } from "@/lib/logger";
import { tracerProvider } from "@/lib/observability/langfuse";
import { registerModelService } from "@/lib/providers/model-service";
import { registerKeyValidationService } from "@/lib/security/key-validation-service";
import { storage } from "@/lib/storage";
import { registerSyncService } from "@/lib/sync/sync-service";

const logger = createLogger("background");

const WEBSITE_URL = import.meta.env.WXT_WEBSITE_URL || "https://superfill.ai";

function isWebappAuthPage(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.origin === WEBSITE_URL &&
      (urlObj.pathname.includes("/login") ||
        urlObj.pathname.includes("/oauth") ||
        urlObj.pathname.includes("/auth"))
    );
  } catch {
    return false;
  }
}

export default defineBackground({
  type: "module",
  main: () => {
    if (DEBUG) {
      tracerProvider.register();
    }

    registerCategorizationService();
    registerKeyValidationService();
    registerModelService();
    registerSessionService();
    registerAuthService();
    const syncService = registerSyncService();
    const autofillService = registerAutofillService();
    const sessionService = getSessionService();

    browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.url && isWebappAuthPage(changeInfo.url)) {
        logger.info("Detected webapp auth page navigation");
      }
    });

    browser.runtime.onMessage.addListener(async (message) => {
      try {
        if (message.type === "SUPERFILL_AUTH_SUCCESS") {
          logger.info("Received auth tokens from webapp", {
            hasAccessToken: !!message.access_token,
            hasRefreshToken: !!message.refresh_token,
            userId: message.user?.id,
          });

          const authService = getAuthService();
          await authService.setAuthToken(
            message.access_token,
            message.refresh_token,
          );
          logger.info("Auth tokens set successfully in background");
        }
      } catch (error) {
        logger.error("Error processing runtime message:", error);
      }
    });

    setTimeout(() => {
      syncService.performStartupSync();
    }, 5000);

    browser.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === "install") {
        logger.info("Extension installed for the first time, opening settings");

        const currentSettings = await storage.uiSettings.getValue();
        const storedMemories = await storage.memories.getValue();

        await storage.uiSettings.setValue({
          ...currentSettings,
          onboardingCompleted: storedMemories.length !== 0,
        });

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

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        autofillService.dispose();
        logger.info("Background script HMR cleanup completed");
      });
    }
  },
});
