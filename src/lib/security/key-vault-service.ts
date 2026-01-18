import { defineProxyService } from "@webext-core/proxy-service";
import type { AIProvider } from "@/lib/providers/registry";
import { storage } from "@/lib/storage";
import { createLogger } from "../logger";
import { getKeyValidationService } from "./key-validation-service";
import {
  getOffscreenFingerprint,
  offscreenDecrypt,
  offscreenEncrypt,
  offscreenGenerateSalt,
} from "./offscreen-utils";

interface ValidationCache {
  timestamp: number;
  isValid: boolean;
}

const logger = createLogger("key-vault-service");

class KeyVaultService {
  private validationCache = new Map<string, ValidationCache>();
  private CACHE_DURATION = 3600000;

  async storeKey(provider: AIProvider, key: string): Promise<void> {
    const salt = await offscreenGenerateSalt();
    const encrypted = await offscreenEncrypt(key, salt);
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

    try {
      return await offscreenDecrypt(
        encryptedData.encrypted,
        encryptedData.salt,
      );
    } catch {
      logger.debug(
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

  async hasKey(provider: AIProvider): Promise<boolean> {
    const keys = await storage.apiKeys.getValue();
    return !!keys[provider];
  }

  async getFingerprint(): Promise<string> {
    return getOffscreenFingerprint();
  }
}

export const [registerKeyVaultService, getKeyVaultService] = defineProxyService(
  "KeyVaultService",
  () => new KeyVaultService(),
);
