import { browser } from "wxt/browser";
import { createLogger } from "@/lib/logger";
import { getBrowserFingerprint } from "@/lib/security/fingerprint";

const logger = createLogger("offscreen");

export const initOffscreen = () => {
  browser.runtime.onMessage.addListener(
    (message: Record<string, unknown>, _sender, sendResponse) => {
      if (message.type === "GET_FINGERPRINT") {
        getBrowserFingerprint()
          .then((fingerprint) => {
            sendResponse({ fingerprint });
          })
          .catch((error) => {
            logger.error("Failed to generate fingerprint:", error);
            sendResponse({
              error: error instanceof Error ? error.message : "Unknown error",
            });
          });
        return true;
      }
    },
  );

  logger.info("Offscreen script initialized");
};

export default defineUnlistedScript(() => {
  initOffscreen();
});
