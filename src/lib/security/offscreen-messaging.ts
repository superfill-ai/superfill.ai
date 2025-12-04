import { createLogger } from "../logger";

const logger = createLogger("offscreen-messaging");
let creationPromise: Promise<void> | null = null;

export async function getFingerprintFromOffscreen(): Promise<string> {
  const existingContexts = await browser.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"] as Browser.runtime.ContextType[],
  });

  if (existingContexts.length === 0) {
    if (!creationPromise) {
      creationPromise = browser.offscreen
        .createDocument({
          url: "offscreen.html",
          reasons: ["DOM_PARSER" as Browser.offscreen.Reason],
          justification: "Generate browser fingerprint for encryption",
        })
        .finally(() => {
          creationPromise = null;
        });
    }

    try {
      await creationPromise;
    } catch (error) {
      logger.error("Failed to create offscreen document:", error);
      throw new Error("Offscreen document creation failed");
    }
  }

  try {
    const response = (await browser.runtime.sendMessage({
      type: "GET_FINGERPRINT",
    })) as { fingerprint?: string; error?: string };

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.fingerprint) {
      throw new Error("No fingerprint returned from offscreen");
    }

    return response.fingerprint;
  } catch (error) {
    logger.error("Failed to get fingerprint from offscreen:", error);
    throw error;
  }
}
