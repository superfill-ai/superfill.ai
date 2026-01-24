import { createLogger, DEBUG } from "@superfill/shared/logger";
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
import { tracerProvider } from "@/lib/observability/langfuse";
import { registerModelService } from "@/lib/providers/model-service";
import { registerKeyValidationService } from "@/lib/security/key-validation-service";
import {
  getKeyVaultService,
  registerKeyVaultService,
} from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import { migrateAISettings } from "./lib/migrate-settings-handler";

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

    const updateContextMenu = async (enabled: boolean) => {
      try {
        if (enabled) {
          await browser.contextMenus.remove(CONTEXT_MENU_ID).catch(() => {});
          browser.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: "Fill with superfill.ai",
            contexts: ["editable", "page"],
          });
          logger.debug("Context menu created");
        } else {
          await browser.contextMenus.remove(CONTEXT_MENU_ID).catch(() => {});
          logger.debug("Context menu removed");
        }
      } catch (error) {
        logger.error("Failed to update context menu:", error);
      }
    };

    (async () => {
      const settings = await migrateAISettings();
      updateContextMenu(settings.contextMenuEnabled);
    })();

    storage.aiSettings.watch((newSettings) => {
      if (newSettings) {
        updateContextMenu(newSettings.contextMenuEnabled);
      }
    });

    browser.contextMenus.onClicked.addListener(async (info, tab) => {
      if (info.menuItemId === CONTEXT_MENU_ID && tab?.id) {
        logger.debug("Context menu autofill triggered", { tabId: tab.id });
        try {
          await autofillService.startAutofillOnActiveTab();
        } catch (error) {
          logger.error("Context menu autofill failed:", error);
        }
      }
    });

    browser.runtime.onInstalled.addListener(async (details) => {
      const manifest = browser.runtime.getManifest();
      const currentVersion = manifest.version;
      const uiSettings = await storage.uiSettings.getValue();

      if (details.reason === "install") {
        logger.debug(
          "Extension installed for the first time, opening settings",
        );

        const storedMemories = await storage.memories.getValue();

        await storage.uiSettings.setValue({
          ...uiSettings,
          onboardingCompleted: storedMemories.length !== 0,
          extensionVersion: currentVersion,
        });

        browser.runtime.openOptionsPage();
      } else if (details.reason === "update") {
        const previousVersion = uiSettings.extensionVersion || "0.0.0";

        logger.debug("Extension updated", {
          from: previousVersion,
          to: currentVersion,
        });

        await storage.uiSettings.setValue({
          ...uiSettings,
          extensionVersion: currentVersion,
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

    // TODO: Implement webRequest-based form submission detection with proper scoping
    // Currently commented out due to privacy concerns with <all_urls> scope.
    // Need to:
    // 1. Scope webRequest to only URLs with detected forms (like Bitwarden does)
    // 2. Dynamically add/remove listeners based on active tabs with forms
    // 3. Remove URL logging in production
    // 4. Add privacy disclosure documentation
    // See: https://github.com/bitwarden/clients (overlay-notifications.background.ts)
    //
    // if (browser.webRequest?.onBeforeRequest) {
    //   browser.webRequest.onBeforeRequest.addListener(
    //     (details) => {
    //       if (
    //         details.method === "POST" ||
    //         details.method === "PUT" ||
    //         details.method === "PATCH"
    //       ) {
    //         logger.debug(
    //           "webRequest detected form submission:",
    //           details.method,
    //           details.url,
    //         );
    //
    //         if (details.tabId && details.tabId !== -1) {
    //           browser.tabs
    //             .sendMessage(details.tabId, {
    //               type: "FORM_SUBMITTED_VIA_WEBREQUEST",
    //               url: details.url,
    //               method: details.method,
    //               timestamp: Date.now(),
    //             })
    //             .catch((error) => {
    //               logger.debug("Could not notify content script:", error);
    //             });
    //         }
    //       }
    //       return undefined;
    //     },
    //     {
    //       urls: ["<all_urls>"],
    //       types: ["xmlhttprequest", "main_frame", "sub_frame"],
    //     },
    //   );
    //   logger.debug(
    //     "webRequest listener registered for form submission detection",
    //   );
    // } else {
    //   logger.debug(
    //     "webRequest API not available, using content script detection only",
    //   );
    // }

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

          logger.debug("Captured memories saved:", result);
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

        logger.debug(
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

    logger.debug("Background script initialized with all services");

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        autofillService.dispose();
        logger.debug("Background script HMR cleanup completed");
      });
    }
  },
});
