import { registerCategorizationService } from "@/lib/ai/categorization-service";
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
import { registerKeyVaultService } from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";

const logger = createLogger("background");

export default defineBackground({
  type: "module",
  main: () => {
    if (DEBUG) {
      tracerProvider.register();
    }
    registerCategorizationService();
    registerKeyValidationService();
    registerKeyVaultService();
    registerModelService();
    const autofillService = registerAutofillService();
    registerSessionService();

    const sessionService = getSessionService();

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

    contentAutofillMessaging.onMessage("saveFormMappings", async ({ data }) => {
      return sessionService.saveFormMappings(data.sessionId, data.formMappings);
    });

    browser.runtime.onMessage.addListener((message, sender) => {
      if (
        message.type === "FILL_ALL_FRAMES" &&
        sender.tab?.id &&
        sender.url &&
        sender.frameId !== undefined
      ) {
        const tabId = sender.tab.id;
        const fieldsToFill = message.fieldsToFill;

        logger.info(
          `Broadcasting fill command to all frames in tab ${tabId} for ${fieldsToFill.length} fields`,
        );

        contentAutofillMessaging
          .sendMessage("fillFields", { fieldsToFill }, tabId)
          .catch((error) => {
            logger.error("Failed to broadcast fill command:", error);
          });
      }
      return true;
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
