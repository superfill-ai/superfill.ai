import { createLogger } from "@/lib/logger";
import { store } from "@/lib/storage";
import { defineProxyService } from "@webext-core/proxy-service";
import {
  type AnalysisResult,
  categorizationAgent,
  fallbackCategorization,
} from "./categorization";

const logger = createLogger("categorization-service");

class CategorizationService {
  async analyze(
    answer: string,
    question?: string,
    apiKey?: string,
  ): Promise<AnalysisResult> {
    try {
      if (!apiKey) {
        logger.warn("No API key provided, using fallback categorization");
        return await fallbackCategorization(answer, question);
      }

      const userSettings = await store.userSettings.getValue();
      const { selectedProvider, selectedModels } = userSettings;
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
      // Fallback to rule-based categorization
      return await fallbackCategorization(answer, question);
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
