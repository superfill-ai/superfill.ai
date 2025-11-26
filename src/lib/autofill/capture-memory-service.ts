import { v7 as uuidv7 } from "uuid";
import { BulkCategorizer } from "@/lib/ai/bulk-categorizer";
import { createLogger } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import { storage } from "@/lib/storage";
import type { CapturedFieldData } from "@/types/autofill";
import type { MemoryEntry } from "@/types/memory";

const logger = createLogger("capture-memory-service");

export class CaptureMemoryService {
  private categorizer: BulkCategorizer;

  constructor() {
    this.categorizer = new BulkCategorizer();
  }

  async saveCapturedMemories(
    capturedFields: CapturedFieldData[],
    provider?: AIProvider,
    apiKey?: string,
    modelName?: string,
  ): Promise<{ success: boolean; savedCount: number }> {
    try {
      if (capturedFields.length === 0) {
        logger.info("No fields to capture");
        return { success: true, savedCount: 0 };
      }

      logger.info(`Processing ${capturedFields.length} captured fields`);

      const fieldsToSave = capturedFields.filter((f) => f.question && f.answer);

      if (fieldsToSave.length === 0) {
        logger.info("No valid fields with both question and answer");
        return { success: true, savedCount: 0 };
      }

      let categories: string[] = [];

      if (provider && apiKey) {
        try {
          const categorized = await this.categorizer.categorizeFields(
            fieldsToSave.map((f) => ({
              question: f.question,
              answer: f.answer,
            })),
            provider,
            apiKey,
            modelName,
          );
          categories = categorized.map((c) => c.category);
          logger.info("Bulk categorization completed", categories);
        } catch (error) {
          logger.error("Bulk categorization failed, using fallback:", error);
          categories = fieldsToSave.map(() => "general");
        }
      } else {
        logger.info("No AI provider configured, using fallback categories");
        categories = fieldsToSave.map(() => "general");
      }

      const newMemories: MemoryEntry[] = fieldsToSave.map((field, idx) => ({
        id: uuidv7(),
        question: field.question,
        answer: field.answer,
        category: categories[idx] as MemoryEntry["category"],
        tags: [],
        confidence: 0.8,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: "autofill",
          usageCount: 0,
        },
      }));

      const currentMemories = await storage.memories.getValue();
      const updatedMemories = [...currentMemories, ...newMemories];
      await storage.memories.setValue(updatedMemories);

      logger.info(`Successfully saved ${newMemories.length} new memories`);

      return { success: true, savedCount: newMemories.length };
    } catch (error) {
      logger.error("Failed to save captured memories:", error);
      return {
        success: false,
        savedCount: 0,
      };
    }
  }
}

let serviceInstance: CaptureMemoryService | null = null;

export function getCaptureMemoryService(): CaptureMemoryService {
  if (!serviceInstance) {
    serviceInstance = new CaptureMemoryService();
  }
  return serviceInstance;
}

export function registerCaptureMemoryService(): CaptureMemoryService {
  serviceInstance = new CaptureMemoryService();
  logger.info("CaptureMemoryService registered");
  return serviceInstance;
}
