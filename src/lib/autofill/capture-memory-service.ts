import stringComparison from "string-comparison";
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
import { normalizeString } from "../string";

const logger = createLogger("capture-memory-service");

const FALLBACK_CONFIDENCE_ON_ERROR = 0.3;
const FALLBACK_CONFIDENCE_NO_AI = 0.5;
const DEFAULT_CATEGORY = "general";
const QUESTION_SIMILARITY_THRESHOLD = 0.85;

const { diceCoefficient, jaroWinkler } = stringComparison;

function areQuestionsSimilar(q1: string, q2: string): boolean {
  const norm1 = normalizeString(q1);
  const norm2 = normalizeString(q2);

  if (norm1 === norm2) return true;

  const diceSim = diceCoefficient.similarity(norm1, norm2);
  const jaroSim = jaroWinkler.similarity(norm1, norm2);
  const combinedSim = (diceSim + jaroSim) / 2;

  return combinedSim >= QUESTION_SIMILARITY_THRESHOLD;
}

function areAnswersEqual(a1: string, a2: string): boolean {
  return normalizeString(a1) === normalizeString(a2);
}

type DeduplicationResult = {
  toCreate: Array<{ question: string; answer: string; catIndex: number }>;
  toUpdate: Array<{
    existingMemory: MemoryEntry;
    newAnswer: string;
    catIndex: number;
  }>;
};

export class CaptureMemoryService {
  private categorizer: BulkCategorizer;

  constructor() {
    this.categorizer = new BulkCategorizer();
  }

  private deduplicateFields(
    fieldsToSave: Array<{ question: string; answer: string }>,
    currentMemories: MemoryEntry[],
  ): DeduplicationResult {
    const result: DeduplicationResult = {
      toCreate: [],
      toUpdate: [],
    };

    for (let i = 0; i < fieldsToSave.length; i++) {
      const field = fieldsToSave[i];
      let foundSimilarQuestion = false;

      for (const existing of currentMemories) {
        if (!existing.question) continue;

        if (areQuestionsSimilar(field.question, existing.question)) {
          foundSimilarQuestion = true;

          if (!areAnswersEqual(field.answer, existing.answer)) {
            result.toUpdate.push({
              existingMemory: existing,
              newAnswer: field.answer,
              catIndex: i,
            });
          }
          break;
        }
      }

      if (!foundSimilarQuestion) {
        result.toCreate.push({
          question: field.question,
          answer: field.answer,
          catIndex: i,
        });
      }
    }

    return result;
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
            category: DEFAULT_CATEGORY,
            confidence: FALLBACK_CONFIDENCE_ON_ERROR,
          }));
        }
      } else {
        logger.info("No AI provider configured, using fallback categories");
        categorized = fieldsToSave.map(() => ({
          category: DEFAULT_CATEGORY,
          confidence: FALLBACK_CONFIDENCE_NO_AI,
        }));
      }

      const isValidCategory = (cat: string): cat is MemoryEntry["category"] => {
        return allowedCategories.includes(cat as MemoryEntry["category"]);
      };

      const currentMemories = await storage.memories.getValue();

      const { toCreate, toUpdate } = this.deduplicateFields(
        fieldsToSave.map((f) => ({ question: f.question, answer: f.answer })),
        currentMemories,
      );

      logger.info(
        `Deduplication: ${toCreate.length} new, ${toUpdate.length} updates, ${fieldsToSave.length - toCreate.length - toUpdate.length} skipped`,
      );

      const newMemories: MemoryEntry[] = toCreate.map((item) => {
        const catResult = categorized[item.catIndex];
        const validCategory = isValidCategory(catResult.category)
          ? catResult.category
          : DEFAULT_CATEGORY;

        return {
          id: uuidv7(),
          question: item.question,
          answer: item.answer,
          category: validCategory,
          tags: [],
          confidence: catResult.confidence,
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: "autofill",
          },
        };
      });

      const updatedExistingMemories = currentMemories.map((memory) => {
        const updateItem = toUpdate.find(
          (u) => u.existingMemory.id === memory.id,
        );
        if (updateItem) {
          const catResult = categorized[updateItem.catIndex];
          const validCategory = isValidCategory(catResult.category)
            ? catResult.category
            : memory.category;

          return {
            ...memory,
            answer: updateItem.newAnswer,
            category: validCategory,
            confidence: Math.max(memory.confidence, catResult.confidence),
            metadata: {
              ...memory.metadata,
              updatedAt: new Date().toISOString(),
            },
          };
        }
        return memory;
      });

      const finalMemories = [...updatedExistingMemories, ...newMemories];
      await storage.memories.setValue(finalMemories);

      const totalChanges = newMemories.length + toUpdate.length;
      logger.info(
        `Successfully saved ${newMemories.length} new memories and updated ${toUpdate.length} existing`,
      );

      return { success: true, savedCount: totalChanges };
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
