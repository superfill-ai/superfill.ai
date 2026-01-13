import { defineProxyService } from "@webext-core/proxy-service";
import { v7 as uuidv7 } from "uuid";
import {
  DeduplicationCategorizer,
  type DeduplicationOperation,
} from "@/lib/ai/deduplication-categorizer";
import { allowedCategories } from "@/lib/copies";
import { createLogger } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import { storage } from "@/lib/storage";
import type { CapturedFieldData } from "@/types/autofill";
import type { MemoryEntry } from "@/types/memory";

const logger = createLogger("capture-memory-service");

const DEFAULT_CATEGORY = "general";

export class CaptureMemoryService {
  private deduplicator: DeduplicationCategorizer;

  constructor() {
    this.deduplicator = new DeduplicationCategorizer();
  }

  async saveCapturedMemories(
    capturedFields: CapturedFieldData[],
    provider?: AIProvider,
    apiKey?: string,
    modelName?: string,
  ): Promise<{ success: boolean; savedCount: number }> {
    try {
      if (capturedFields.length === 0) {
        logger.debug("No fields to capture");
        return { success: true, savedCount: 0 };
      }

      logger.debug(`Processing ${capturedFields.length} captured fields`);
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
        logger.debug("No valid fields with both question and answer");
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

      logger.debug(
        `${fieldsToSave.length} fields passed question+answer filter`,
      );

      const currentMemories = await storage.memories.getValue();

      if (!provider || !apiKey) {
        logger.debug("No AI provider configured, using fallback deduplication");
        const fallbackResult = this.deduplicator.fallbackDeduplication(
          fieldsToSave.map((f, index) => ({
            index,
            question: f.question,
            answer: f.answer,
            fieldPurpose: f.fieldMetadata.purpose,
          })),
          currentMemories,
        );

        const { newMemories, existingMemories } = this.applyOperations(
          fallbackResult.operations,
          fieldsToSave,
          currentMemories,
        );

        const finalMemories = [...existingMemories, ...newMemories];
        await storage.memories.setValue(finalMemories);

        const totalChanges =
          newMemories.length +
          fallbackResult.operations.filter((op) => op.action === "update")
            .length;
        logger.debug(
          `Fallback saved ${newMemories.length} new memories and updated ${fallbackResult.operations.filter((op) => op.action === "update").length} existing`,
        );

        return { success: true, savedCount: totalChanges };
      }

      const deduplicationResult = await this.deduplicator.processFields(
        fieldsToSave.map((f, index) => ({
          index,
          question: f.question,
          answer: f.answer,
          fieldPurpose: f.fieldMetadata.purpose,
        })),
        currentMemories,
        provider,
        apiKey,
        modelName,
      );

      logger.debug(
        `Deduplication completed:`,
        deduplicationResult.operations.map((op) => ({
          action: op.action,
          fieldIndex: op.fieldIndex,
        })),
      );

      const { newMemories, existingMemories } = this.applyOperations(
        deduplicationResult.operations,
        fieldsToSave,
        currentMemories,
      );

      const finalMemories = [...existingMemories, ...newMemories];
      await storage.memories.setValue(finalMemories);

      const createCount = deduplicationResult.operations.filter(
        (op) => op.action === "create",
      ).length;
      const updateCount = deduplicationResult.operations.filter(
        (op) => op.action === "update",
      ).length;
      const skipCount = deduplicationResult.operations.filter(
        (op) => op.action === "skip",
      ).length;

      logger.debug(
        `Successfully processed: ${createCount} created, ${updateCount} updated, ${skipCount} skipped`,
      );

      return { success: true, savedCount: createCount + updateCount };
    } catch (error) {
      logger.error("Failed to save captured memories:", error);
      return {
        success: false,
        savedCount: 0,
      };
    }
  }

  private applyOperations(
    operations: DeduplicationOperation[],
    fieldsToSave: CapturedFieldData[],
    currentMemories: MemoryEntry[],
  ): {
    newMemories: MemoryEntry[];
    existingMemories: MemoryEntry[];
  } {
    const isValidCategory = (cat: string): cat is MemoryEntry["category"] => {
      return allowedCategories.includes(cat as MemoryEntry["category"]);
    };

    const newMemories: MemoryEntry[] = [];
    const memoryMap = new Map(currentMemories.map((m) => [m.id, m]));

    for (const op of operations) {
      if (op.action === "create") {
        const field = fieldsToSave[op.fieldIndex];
        const validCategory = isValidCategory(op.category)
          ? op.category
          : DEFAULT_CATEGORY;

        newMemories.push({
          id: uuidv7(),
          question: field.question,
          answer: field.answer,
          category: validCategory,
          tags: op.tags || [],
          confidence: op.confidence,
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: "autofill",
            fieldPurpose: field.fieldMetadata.purpose,
          },
        });
      } else if (op.action === "update") {
        const existingMemory = memoryMap.get(op.existingMemoryId);
        if (existingMemory) {
          const validCategory = isValidCategory(op.category)
            ? op.category
            : existingMemory.category;

          memoryMap.set(op.existingMemoryId, {
            ...existingMemory,
            answer: op.newAnswer,
            category: validCategory,
            tags: op.tags || existingMemory.tags,
            confidence: op.confidence,
            metadata: {
              ...existingMemory.metadata,
              updatedAt: new Date().toISOString(),
            },
          });
        }
      }
    }

    return {
      newMemories,
      existingMemories: Array.from(memoryMap.values()),
    };
  }
}

export const [registerCaptureMemoryService, getCaptureMemoryService] =
  defineProxyService("CaptureMemoryService", () => new CaptureMemoryService());
