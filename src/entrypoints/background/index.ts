import { registerCategorizationService } from "@/lib/ai/categorization-service";
import {
  getAutofillService,
  registerAutofillService,
} from "@/lib/autofill/autofill-service";
import {
  getCaptureMemoryService,
  registerCaptureMemoryService,
} from "@/lib/autofill/capture-memory-service";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import {
  getSessionService,
  registerSessionService,
} from "@/lib/autofill/session-service";
import { createLogger, DEBUG } from "@/lib/logger";
import { tracerProvider } from "@/lib/observability/langfuse";
import { registerModelService } from "@/lib/providers/model-service";
import { registerKeyValidationService } from "@/lib/security/key-validation-service";
import { getKeyVault, registerKeyVault } from "@/lib/security/key-vault";
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
    registerKeyVault();
    registerModelService();
    registerAutofillService();
    registerSessionService();
    registerCaptureMemoryService();

    const autofillService = getAutofillService();
    const sessionService = getSessionService();
    const captureMemoryService = getCaptureMemoryService();
    const keyVault = getKeyVault();

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

    contentAutofillMessaging.onMessage(
      "saveCapturedMemories",
      async ({ data }) => {
        try {
          const aiSettings = await storage.aiSettings.getValue();
          const provider = aiSettings.selectedProvider;

          if (!provider) {
            logger.error("No AI provider configured");
            return { success: false, savedCount: 0 };
          }

          const apiKey = await keyVault.getKey(provider);
          if (!apiKey) {
            logger.error("Failed to retrieve API key for categorization");
            return { success: false, savedCount: 0 };
          }

          const modelName = aiSettings.selectedModels?.[provider];

          const result = await captureMemoryService.saveCapturedMemories(
            data.capturedFields,
            provider,
            apiKey,
            modelName,
          );

          logger.info("Captured memories saved:", result);
          return result;
        } catch (error) {
          logger.error("Failed to save captured memories:", error);
          return { success: false, savedCount: 0 };
        }
      },
    );
    logger.info("Background script initialized with all services");

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        autofillService.dispose();
        logger.info("Background script HMR cleanup completed");
      });
    }
  },
});
