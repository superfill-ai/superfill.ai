import { createLogger } from "../logger";

const logger = createLogger("offscreen-messaging");

export async function getFingerprintFromOffscreen(): Promise<string> {
  const existingContexts = await browser.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"] as Browser.runtime.ContextType[],
  });

  if (existingContexts.length === 0) {
    await browser.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DOM_PARSER" as Browser.offscreen.Reason],
      justification: "Generate browser fingerprint for encryption",
    });
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
