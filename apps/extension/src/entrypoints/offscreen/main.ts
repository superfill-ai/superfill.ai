import { decrypt, encrypt, generateSalt } from "@/lib/security/encryption";
import { getBrowserFingerprint } from "@/lib/security/fingerprint";

type OffscreenMessageType =
  | "GET_FINGERPRINT"
  | "ENCRYPT"
  | "DECRYPT"
  | "GENERATE_SALT";

interface OffscreenMessage {
  type: OffscreenMessageType;
  data?: unknown;
}

interface EncryptRequest {
  plaintext: string;
  salt: string;
}

interface DecryptRequest {
  ciphertext: string;
  salt: string;
}

browser.runtime.onMessage.addListener(
  (message: OffscreenMessage, _sender, sendResponse) => {
    if (message.type === "GET_FINGERPRINT") {
      getBrowserFingerprint()
        .then((fingerprint) =>
          sendResponse({ success: true, data: fingerprint }),
        )
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === "ENCRYPT") {
      const { plaintext, salt } = message.data as EncryptRequest;
      getBrowserFingerprint()
        .then((fingerprint) => encrypt(plaintext, fingerprint, salt))
        .then((encrypted) => sendResponse({ success: true, data: encrypted }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === "DECRYPT") {
      const { ciphertext, salt } = message.data as DecryptRequest;
      getBrowserFingerprint()
        .then((fingerprint) => decrypt(ciphertext, fingerprint, salt))
        .then((decrypted) => sendResponse({ success: true, data: decrypted }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === "GENERATE_SALT") {
      generateSalt()
        .then((salt) => sendResponse({ success: true, data: salt }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    return false;
  },
);
