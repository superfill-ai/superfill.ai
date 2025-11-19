import type { AIProvider } from "@/lib/providers/registry";
import { storage } from "@/lib/storage";
import { createLogger } from "../logger";
import { decrypt, encrypt, generateSalt } from "./encryption";
import { getBrowserFingerprint } from "./fingerprint";
import { getKeyValidationService } from "./key-validation-service";

interface ValidationCache {
  timestamp: number;
  isValid: boolean;
}

const logger = createLogger("key-vault");

/**
 * KeyVault - Secure API key storage with device-bound encryption
 *
 * IMPORTANT: All methods MUST be called from a browser context (popup/options/content script)
 * DO NOT call from background/service worker context due to fingerprinting requirements.
 *
 * Usage Pattern:
 * 1. In browser context: Decrypt API key using keyVault.getKey()
 * 2. Pass decrypted key to background services as needed
 * 3. Background services use the plain key temporarily for API calls
 */
export class KeyVault {
  private validationCache = new Map<string, ValidationCache>();
  private CACHE_DURATION = 3600000;

  async storeKey(provider: AIProvider, key: string): Promise<void> {
    const fingerprint = await getBrowserFingerprint();
    const salt = await generateSalt();
    const encrypted = await encrypt(key, fingerprint, salt);

    const currentKeys = await storage.apiKeys.getValue();
    await storage.apiKeys.setValue({
      ...currentKeys,
      [provider]: { encrypted, salt },
    });
  }

  async getKey(provider: AIProvider): Promise<string | null> {
    const keys = await storage.apiKeys.getValue();

    if (!keys[provider]) {
      return null;
    }

    const encryptedData = keys[provider];
    const fingerprint = await getBrowserFingerprint();

    try {
      return await decrypt(
        encryptedData.encrypted,
        fingerprint,
        encryptedData.salt,
      );
    } catch {
      logger.info(
        `Failed to decrypt ${provider} API key. It may be invalid due to device changes.`,
      );
      return null;
    }
  }

  async deleteKey(provider: AIProvider): Promise<void> {
    const currentKeys = await storage.apiKeys.getValue();
    const { [provider]: _, ...rest } = currentKeys;
    await storage.apiKeys.setValue(rest);
    this.validationCache.delete(provider);
  }

  async validateKey(provider: AIProvider, key: string): Promise<boolean> {
    const cached = this.validationCache.get(provider);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.isValid;
    }

    try {
      const keyValidationService = getKeyValidationService();
      const isValid = await keyValidationService.validateKey(provider, key);
      this.validationCache.set(provider, {
        timestamp: Date.now(),
        isValid,
      });
      return isValid;
    } catch {
      return false;
    }
  }
}

export const keyVault = new KeyVault();
