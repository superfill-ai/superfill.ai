import { v7 as uuidv7 } from "uuid";
import {
  BulkCategorizer,
  type CategorizedField,
} from "@/lib/ai/bulk-categorizer";
import { allowedCategories } from "@/lib/copies";
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
      logger.debug(
        "Captured fields details:",
        capturedFields.map((f) => ({
          opid: f.fieldOpid,
          question: f.question,
          answer: f.answer?.substring(0, 30),
          wasAIFilled: f.wasAIFilled,
        })),
      );

      const fieldsToSave = capturedFields.filter((f) => f.question && f.answer);

      if (fieldsToSave.length === 0) {
        logger.info("No valid fields with both question and answer");
        logger.debug(
          "Filtered out fields:",
          capturedFields.map((f) => ({
            opid: f.fieldOpid,
            hasQuestion: !!f.question,
            hasAnswer: !!f.answer,
          })),
        );
        return { success: true, savedCount: 0 };
      }

      logger.info(
        `${fieldsToSave.length} fields passed question+answer filter`,
      );

      let categorized: CategorizedField[] = [];

      if (provider && apiKey) {
        try {
          categorized = await this.categorizer.categorizeFields(
            fieldsToSave.map((f) => ({
              question: f.question,
              answer: f.answer,
            })),
            provider,
            apiKey,
            modelName,
          );
          logger.info(
            "Bulk categorization completed",
            categorized.map((c) => c.category),
          );
        } catch (error) {
          logger.error("Bulk categorization failed, using fallback:", error);
          categorized = fieldsToSave.map(() => ({
            category: "general",
            confidence: 0.3,
          }));
        }
      } else {
        logger.info("No AI provider configured, using fallback categories");
        categorized = fieldsToSave.map(() => ({
          category: "general",
          confidence: 0.5,
        }));
      }

      const isValidCategory = (cat: string): cat is MemoryEntry["category"] => {
        return allowedCategories.includes(cat as MemoryEntry["category"]);
      };

      const newMemories: MemoryEntry[] = fieldsToSave.map((field, idx) => {
        const catResult = categorized[idx];
        const validCategory = isValidCategory(catResult.category)
          ? catResult.category
          : "general";

        return {
          id: uuidv7(),
          question: field.question,
          answer: field.answer,
          category: validCategory,
          tags: [],
          confidence: catResult.confidence,
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: "autofill",
            usageCount: 0,
          },
        };
      });

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
