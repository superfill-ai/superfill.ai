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
      (async () => {
        const { initializeTracerProvider } = await import(
          "@/lib/observability/telemetry-helpers"
        );
        await initializeTracerProvider();
      })();
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

    // Use setPanelBehavior so Chrome automatically opens the side panel when
    // the extension icon is clicked — no action.onClicked listener needed.
    if (browser.sidePanel?.setPanelBehavior) {
      browser.sidePanel
        .setOptions({ path: "sidepanel.html", enabled: true })
        .catch(() => {});
      browser.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((err: unknown) => logger.error("setPanelBehavior failed", err));
    }

    const updateContextMenu = async (enabled: boolean) => {
      try {
        if (enabled) {
          await browser.contextMenus.remove(CONTEXT_MENU_ID).catch(() => {});
          browser.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: "Fill with superfill.ai",
            contexts: ["editable", "page"],
          });
          logger.info("Context menu created");
        } else {
          await browser.contextMenus.remove(CONTEXT_MENU_ID).catch(() => {});
          logger.info("Context menu removed");
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
        logger.info("Context menu autofill triggered", { tabId: tab.id });
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
        logger.info("Extension installed for the first time, opening settings");

        const storedMemories = await storage.memories.getValue();

        await storage.uiSettings.setValue({
          ...uiSettings,
          onboardingCompleted: storedMemories.length !== 0,
          extensionVersion: currentVersion,
        });

        browser.runtime.openOptionsPage();
      } else if (details.reason === "update") {
        const previousVersion = uiSettings.extensionVersion || "0.0.0";

        logger.info("Extension updated", {
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

    contentAutofillMessaging.onMessage("getTabId", async ({ sender }) => {
      return sender.tab?.id ?? -1;
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

    contentAutofillMessaging.onMessage(
      "broadcastFillToAllFrames",
      async ({ data, sender }) => {
        const tabId = sender.tab?.id;
        if (!tabId) {
          logger.error("No tab ID in sender for broadcastFillToAllFrames");
          return;
        }

        logger.info(
          `Broadcasting fill command to all frames in tab ${tabId} for ${data.fieldsToFill.length} fields`,
        );

        contentAutofillMessaging
          .sendMessage("fillFields", { fieldsToFill: data.fieldsToFill }, tabId)
          .catch((error) => {
            logger.error("Failed to broadcast fill command:", error);
          });
      },
    );

    contentAutofillMessaging.onMessage("sidepanelFill", async ({ data }) => {
      const { tabId, fieldsToFill } = data;
      logger.info(
        `sidepanelFill: filling ${fieldsToFill.length} fields in tab ${tabId}`,
      );
      contentAutofillMessaging
        .sendMessage("fillFields", { fieldsToFill }, tabId)
        .catch((error) => {
          logger.error("sidepanelFill: failed to send fillFields:", error);
        });
      return true;
    });

    contentAutofillMessaging.onMessage("sidepanelClose", async ({ data }) => {
      const { tabId } = data;
      contentAutofillMessaging
        .sendMessage("closePreview", undefined, tabId)
        .catch((err: unknown) => {
          logger.error("sidepanelClose: failed to send closePreview:", err);
        });
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
