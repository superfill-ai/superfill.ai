import type { AIProvider } from "@/lib/providers/registry";
import { storage } from "@/lib/storage";
import { defineProxyService } from "@webext-core/proxy-service";
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
 * This is a proxy service that MUST run in the background script context.
 *
 * Usage Pattern:
 * 1. Call registerKeyVault() in background script
 * 2. Call getKeyVault() from any entrypoint to get the proxy
 * 3. All encryption/decryption happens in background via offscreen API
 */
class KeyVault {
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

export const [registerKeyVault, getKeyVault] = defineProxyService(
  "KeyVault",
  () => new KeyVault(),
);
