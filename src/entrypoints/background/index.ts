import { registerCategorizationService } from "@/lib/ai/categorization-service";
import { getAuthService, registerAuthService } from "@/lib/auth/auth-service";
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
import {
  getCDPAutofillService,
  registerCDPAutofillService,
} from "@/lib/cdp/cdp-autofill-service";
import { createLogger, DEBUG } from "@/lib/logger";
import { registerModelService } from "@/lib/providers/model-service";
import { registerKeyValidationService } from "@/lib/security/key-validation-service";
import {
  getKeyVaultService,
  registerKeyVaultService,
} from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import { getSyncService, registerSyncService } from "@/lib/sync/sync-service";
import type { AuthSuccessMessage, Message } from "@/types/message";
import { migrateAISettings } from "./lib/migrate-settings-handler";

const logger = createLogger("background");

const CONTEXT_MENU_ID = "superfill-autofill";
const CDP_CONTEXT_MENU_ID = "superfill-cdp-agent";

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
    registerAutofillService();
    registerAuthService();
    registerCaptureMemoryService();
    registerCategorizationService();
    registerCDPAutofillService();
    registerKeyValidationService();
    registerKeyVaultService();
    registerModelService();
    registerSessionService();
    registerSyncService();
    const authService = getAuthService();
    const autofillService = getAutofillService();
    const captureMemoryService = getCaptureMemoryService();
    const cdpAutofillService = getCDPAutofillService();
    const keyVault = getKeyVaultService();
    const sessionService = getSessionService();
    const syncService = getSyncService();

    const updateContextMenu = async (enabled: boolean) => {
      try {
        if (enabled) {
          await browser.contextMenus.remove(CONTEXT_MENU_ID).catch(() => {});
          await browser.contextMenus
            .remove(CDP_CONTEXT_MENU_ID)
            .catch(() => {});
          browser.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: "Fill with superfill.ai",
            contexts: ["editable", "page"],
          });
          browser.contextMenus.create({
            id: CDP_CONTEXT_MENU_ID,
            title: "Fill with superfill.ai (Agent Mode)",
            contexts: ["editable", "page"],
          });
          logger.info("Context menus created");
        } else {
          await browser.contextMenus.remove(CONTEXT_MENU_ID).catch(() => {});
          await browser.contextMenus
            .remove(CDP_CONTEXT_MENU_ID)
            .catch(() => {});
          logger.info("Context menus removed");
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

      if (info.menuItemId === CDP_CONTEXT_MENU_ID && tab?.id) {
        logger.debug("CDP agent mode triggered", { tabId: tab.id });
        try {
          const result = await cdpAutofillService.startAgentOnActiveTab();
          logger.info("CDP agent result:", {
            success: result.success,
            steps: result.totalSteps,
            summary: result.summary,
          });
        } catch (error) {
          logger.error("CDP agent failed:", error);
        }
      }
    });

    const handleAuthentication = async (
      message: Message<AuthSuccessMessage>,
      sender: globalThis.Browser.runtime.MessageSender,
    ) => {
      if (
        message.type === "SUPERFILL_AUTH_SUCCESS" &&
        sender.id === browser.runtime.id
      ) {
        logger.debug("Received auth tokens from webapp", {
          hasAccessToken: !!message.access_token,
          hasRefreshToken: !!message.refresh_token,
          userId: message.user?.id,
        });

        await authService.setAuthToken(
          message.access_token,
          message.refresh_token,
        );
        logger.debug("Auth tokens set successfully in background");

        return true;
      }
    };

    browser.runtime.onMessage.addListener((message, sender) => {
      handleAuthentication(message, sender).catch(logger.error);

      return true;
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
      }
      browser.runtime.openOptionsPage();
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

    setTimeout(() => {
      syncService.performStartupSync();
    }, 5000);

    logger.debug("Background script initialized with all services");

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        autofillService.dispose();
        cdpAutofillService.dispose();
        logger.debug("Background script HMR cleanup completed");
      });
    }
  },
});
