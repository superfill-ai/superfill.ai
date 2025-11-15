import { registerCategorizationService } from "@/lib/ai/categorization-service";
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

const logger = createLogger("background");

export default defineBackground({
  type: "module",
  main: () => {
    tracerProvider.register();
    registerCategorizationService();
    registerKeyValidationService();
    registerModelService();
    const autofillService = registerAutofillService();
    registerSessionService();

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

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        autofillService.dispose();
        logger.info("Background script HMR cleanup completed");
      });
    }
  },
});
