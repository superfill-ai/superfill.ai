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
import {
  getKeyVaultService,
  registerKeyVaultService,
} from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";

const logger = createLogger("background");

const CONTEXT_MENU_ID = "superfill-autofill";

export default defineBackground({
  type: "module",
  main: () => {
    if (DEBUG) {
      tracerProvider.register();
    }
    registerCategorizationService();
    registerKeyValidationService();
    registerKeyVaultService();
    registerCaptureMemoryService();
    registerModelService();
    registerAutofillService();
    registerSessionService();
    const sessionService = getSessionService();
    const captureMemoryService = getCaptureMemoryService();
    const keyVault = getKeyVaultService();
    const autofillService = getAutofillService();

    try {
      browser.contextMenus.remove(CONTEXT_MENU_ID).catch(() => {});
      browser.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: "Fill with superfill.ai",
        contexts: ["editable", "page"],
      });
      logger.info("Context menu created");
    } catch (error) {
      logger.error("Failed to create context menu:", error);
    }

    browser.contextMenus.onClicked.addListener(async (info, tab) => {
      if (info.menuItemId === CONTEXT_MENU_ID && tab?.id) {
        logger.info("Context menu autofill triggered", { tabId: tab.id });
        try {
          await autofillService.startAutofillOnActiveTab();
        } catch (error) {
          logger.error("Context menu autofill failed:", error);
        }
      }
    });

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
