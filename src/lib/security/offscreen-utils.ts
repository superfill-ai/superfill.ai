import { createLogger } from "../logger";
import { decrypt, encrypt, generateSalt } from "./encryption";
import { getBrowserFingerprint } from "./fingerprint";

const logger = createLogger("offscreen-utils");

const OFFSCREEN_DOCUMENT_PATH = "/offscreen.html";

let creating: Promise<void> | null = null;

function isOffscreenAvailable(): boolean {
  return typeof browser.offscreen !== "undefined";
}

async function ensureOffscreenDocument(): Promise<void> {
  if (!browser.offscreen) {
    throw new Error("Offscreen API not available");
  }

  const existingContexts = await browser.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creating) {
    await creating;
    return;
  }

  creating = browser.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["DOM_PARSER"],
    justification: "Generate browser fingerprint for API key encryption",
  });

  try {
    await creating;
    logger.debug("Offscreen document created successfully");
  } finally {
    creating = null;
  }
}

async function sendOffscreenMessage<T>(
  type: string,
  data?: unknown,
): Promise<T> {
  await ensureOffscreenDocument();

  const response = await browser.runtime.sendMessage({
    type,
    data,
  });

  if (!response.success) {
    throw new Error(
      response.error ||
        `Offscreen operation '${type}' failed with unknown error`,
    );
  }

  return response.data as T;
}

export async function getOffscreenFingerprint(): Promise<string> {
  if (!isOffscreenAvailable()) {
    return getBrowserFingerprint();
  }
  return sendOffscreenMessage<string>("GET_FINGERPRINT");
}

export async function offscreenEncrypt(
  plaintext: string,
  salt: string,
): Promise<string> {
  if (!isOffscreenAvailable()) {
    const fingerprint = await getBrowserFingerprint();
    return encrypt(plaintext, fingerprint, salt);
  }
  return sendOffscreenMessage<string>("ENCRYPT", { plaintext, salt });
}

export async function offscreenDecrypt(
  ciphertext: string,
  salt: string,
): Promise<string> {
  if (!isOffscreenAvailable()) {
    const fingerprint = await getBrowserFingerprint();
    return decrypt(ciphertext, fingerprint, salt);
  }
  return sendOffscreenMessage<string>("DECRYPT", { ciphertext, salt });
}

export async function offscreenGenerateSalt(): Promise<string> {
  if (!isOffscreenAvailable()) {
    return generateSalt();
  }
  return sendOffscreenMessage<string>("GENERATE_SALT");
}
