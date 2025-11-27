import type { AIProvider } from "@/lib/providers/registry";
import { storage } from "@/lib/storage";
import { createLogger } from "../logger";
import { decrypt, encrypt, generateSalt } from "./encryption";
import { getKeyValidationService } from "./key-validation-service";
import { getFingerprintFromOffscreen } from "./offscreen-messaging";

interface ValidationCache {
  timestamp: number;
  isValid: boolean;
}

const logger = createLogger("key-vault");

/**
 * KeyVault - Secure API key storage with device-bound encryption
 *
 * Uses offscreen document to generate browser fingerprint from background script.
 * This eliminates the need to pass API keys between entrypoints.
 *
 * Usage Pattern:
 * 1. Background script calls keyVault.storeKey() to encrypt and store
 * 2. Background script calls keyVault.getKey() to decrypt when needed
 * 3. No API key passing required between entrypoints
 */
export class KeyVault {
  private validationCache = new Map<string, ValidationCache>();
  private CACHE_DURATION = 3600000;

  async storeKey(provider: AIProvider, key: string): Promise<void> {
    const fingerprint = await getFingerprintFromOffscreen();
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
    const fingerprint = await getFingerprintFromOffscreen();

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
