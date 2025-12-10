import { defineProxyService } from "@webext-core/proxy-service";
import { createLogger } from "@/lib/logger";
import { getKeyVaultService } from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import { ERROR_MESSAGE_API_KEY_NOT_CONFIGURED } from "../errors";
import {
  type AnalysisResult,
  categorizationAgent,
  fallbackCategorization,
  type RephraseResult,
  rephraseAgent,
} from "./categorization";

const logger = createLogger("categorization-service");

class CategorizationService {
  async categorize(answer: string, question?: string): Promise<AnalysisResult> {
    try {
      const aiSettings = await storage.aiSettings.getValue();
      const { selectedProvider, selectedModels } = aiSettings;

      if (!selectedProvider) {
        throw new Error("AI provider not configured");
      }

      const keyVaultService = getKeyVaultService();
      const apiKey = await keyVaultService.getKey(selectedProvider);

      if (!apiKey) {
        logger.warn(ERROR_MESSAGE_API_KEY_NOT_CONFIGURED);
        throw new Error(ERROR_MESSAGE_API_KEY_NOT_CONFIGURED);
      }

      const selectedModel = selectedModels?.[selectedProvider];

      const result = await categorizationAgent(
        answer,
        question,
        selectedProvider,
        apiKey,
        selectedModel,
      );

      return result;
    } catch (error) {
      logger.error("AI categorization error:", error);
      return await fallbackCategorization(answer, question);
    }
  }

  async rephrase(answer: string, question?: string): Promise<RephraseResult> {
    try {
      const aiSettings = await storage.aiSettings.getValue();
      const { selectedProvider, selectedModels } = aiSettings;

      if (!selectedProvider) {
        throw new Error("AI provider not configured");
      }

      const keyVaultService = getKeyVaultService();
      const apiKey = await keyVaultService.getKey(selectedProvider);

      if (!apiKey) {
        logger.warn(ERROR_MESSAGE_API_KEY_NOT_CONFIGURED);
        throw new Error(ERROR_MESSAGE_API_KEY_NOT_CONFIGURED);
      }

      const selectedModel = selectedModels?.[selectedProvider];

      return await rephraseAgent(
        answer,
        question,
        selectedProvider,
        apiKey,
        selectedModel,
      );
    } catch (error) {
      logger.error("AI rephrasing error in service:", error);
      throw error;
    }
  }

  async getStats() {
    return {
      totalCategorizations: 0,
      aiSuccessRate: 0,
      fallbackRate: 0,
    };
  }
}

export const [registerCategorizationService, getCategorizationService] =
  defineProxyService(
    "CategorizationService",
    () => new CategorizationService(),
  );
