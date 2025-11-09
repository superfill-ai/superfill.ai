import { registerCategorizationService } from "@/lib/ai/categorization-service";
import { registerAuthService } from "@/lib/auth/auth-service";
import { registerAutofillService } from "@/lib/autofill/autofill-service";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-service";
import {
  getSessionService,
  registerSessionService,
} from "@/lib/autofill/session-service";
import { createLogger } from "@/lib/logger";
import { tracerProvider } from "@/lib/observability/langfuse";
import { registerModelService } from "@/lib/providers/model-service";
import { registerKeyValidationService } from "@/lib/security/key-validation-service";

const logger = createLogger("background");

export default defineBackground(() => {
  tracerProvider.register();
  registerCategorizationService();
  registerKeyValidationService();
  registerModelService();
  registerAutofillService();
  registerSessionService();
  registerAuthService();

  const sessionService = getSessionService();

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
