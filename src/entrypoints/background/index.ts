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
import { supabase } from "@/lib/supabase/client";
import { handleStartupSync } from "@/lib/sync/startup-sync";
import { registerSyncService } from "@/lib/sync/sync-service";

const logger = createLogger("background");

function parseUrlHash(url: string): Map<string, string> {
  const hashParts = new URL(url).hash.slice(1).split("&");
  const hashMap = new Map(
    hashParts.map((part) => {
      const [name, value] = part.split("=");
      return [name, value];
    }),
  );
  return hashMap;
}

async function handleOAuthCallback(url: string) {
  try {
    logger.info("Handling OAuth callback from Supabase");

    const hashMap = parseUrlHash(url);
    const accessToken = hashMap.get("access_token");
    const refreshToken = hashMap.get("refresh_token");

    if (!accessToken || !refreshToken) {
      throw new Error("No Supabase tokens found in URL hash");
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) throw error;

    await browser.storage.local.set({
      "superfill:auth:session": data.session,
    });

    logger.info("Successfully authenticated with Supabase");

    try {
      await handleStartupSync();
    } catch (syncError) {
      logger.error("Failed to sync after authentication:", syncError);
    }

    const tabs = await browser.tabs.query({
      url: `${browser.identity.getRedirectURL()}*`,
    });
    for (const tab of tabs) {
      if (tab.id) {
        await browser.tabs.remove(tab.id);
      }
    }

    browser.runtime.openOptionsPage();
  } catch (error) {
    logger.error("Error processing OAuth callback:", error);
  }
}

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

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, _tab) => {
    if (changeInfo.url?.startsWith(browser.identity.getRedirectURL())) {
      handleOAuthCallback(changeInfo.url);
    }
  });

  setTimeout(() => {
    handleStartupSync();
  }, 5000);

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
