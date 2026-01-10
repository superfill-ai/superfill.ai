import { generateObject } from "ai";
import { z } from "zod";
import { CategoryEnum } from "@/lib/ai/categorization";
import { createLogger, DEBUG } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import type { MemoryEntry } from "@/types/memory";
import { getAIModel } from "./model-factory";

const logger = createLogger("ai:deduplication-categorizer");

const MIN_CONFIDENCE_THRESHOLD = 0.5;

const DeduplicationOperationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    fieldIndex: z.number().int().min(0),
    category: CategoryEnum,
    tags: z.array(z.string().min(2).max(50).lowercase()).min(1).max(5),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().optional(),
  }),
  z.object({
    action: z.literal("update"),
    fieldIndex: z.number().int().min(0),
    existingMemoryId: z.uuid(),
    newAnswer: z.string(),
    category: CategoryEnum,
    tags: z.array(z.string().min(2).max(50).lowercase()).min(1).max(5),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().optional(),
  }),
  z.object({
    action: z.literal("skip"),
    fieldIndex: z.number().int().min(0),
    existingMemoryId: z.uuid(),
    reasoning: z.string().optional(),
  }),
]);

const DeduplicationResultSchema = z.object({
  operations: z
    .array(DeduplicationOperationSchema)
    .describe("Array of deduplication operations for each field"),
});

export type DeduplicationOperation = z.infer<
  typeof DeduplicationOperationSchema
>;
export type DeduplicationResult = z.infer<typeof DeduplicationResultSchema>;

export interface FieldToProcess {
  index: number;
  question: string;
  answer: string;
  fieldPurpose?: string;
}

export interface ExistingMemory {
  id: string;
  question?: string;
  answer: string;
  category: string;
  fieldPurpose?: string;
}

export class DeduplicationCategorizer {
  async processFields(
    newFields: FieldToProcess[],
    existingMemories: MemoryEntry[],
    provider: AIProvider,
    apiKey: string,
    modelName?: string,
  ): Promise<DeduplicationResult> {
    if (newFields.length === 0) {
      return { operations: [] };
    }

    try {
      const model = getAIModel(provider, apiKey, modelName);

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(newFields, existingMemories);

      if (DEBUG) {
        logger.debug("Deduplication + Categorization LLM request:", {
          newFieldsCount: newFields.length,
          existingMemoriesCount: existingMemories.length,
          provider,
        });
      }

      const { object: result } = await generateObject({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        schema: DeduplicationResultSchema,
        schemaName: "DeduplicationResult",
        schemaDescription:
          "Deduplication and categorization results for captured fields",
        temperature: 0.3,
        experimental_telemetry: {
          isEnabled: DEBUG,
          functionId: "memory-deduplication-categorization",
          metadata: {
            newFieldsCount: newFields.length,
            existingMemoriesCount: existingMemories.length,
            provider,
          },
        },
      });

      if (DEBUG) {
        logger.debug("Deduplication + Categorization result:", {
          operationsCount: result.operations.length,
          breakdown: {
            create: result.operations.filter((op) => op.action === "create")
              .length,
            update: result.operations.filter((op) => op.action === "update")
              .length,
            skip: result.operations.filter((op) => op.action === "skip").length,
          },
        });
      }

      return this.filterLowConfidenceOperations(result);
    } catch (error) {
      logger.error("Deduplication + Categorization failed:", error);

      if (DEBUG) {
        logger.error("Error details:", {
          message: error instanceof Error ? error.message : String(error),
          newFieldsCount: newFields.length,
          existingMemoriesCount: existingMemories.length,
        });
      }

      return this.fallbackDeduplication(newFields, existingMemories);
    } finally {
      if (DEBUG) {
        logger.debug("Deduplication + Categorization completed");
      }
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert data deduplication and categorization system. Your task is to analyze new form field data against existing stored memories and determine:

1. Whether each new field is semantically UNIQUE or a DUPLICATE of an existing memory
2. If duplicate, whether the answer has CHANGED (requiring update) or is the SAME (skip)
3. The appropriate category and tags for new or updated memories

**Categories**: contact, location, personal, work, education, general

**Your Output**:
For EACH new field (by index), return ONE operation:
- **create**: Field is semantically unique, create new memory
- **update**: Field matches existing memory but answer changed, update the memory
- **skip**: Field matches existing memory with same answer, no action needed

**Deduplication Rules**:

1. **Semantic Similarity**: Questions like "Email", "E-mail address", "Your email", "Electronic mail" are ALL duplicates
2. **Purpose Matching**: Use fieldPurpose metadata - fields with same purpose (e.g., "email") are likely duplicates
3. **Answer Comparison**: 
   - "john@example.com" vs "john@example.com" → SAME (skip)
   - "john@example.com" vs "jane@example.com" → CHANGED (update)
   - "John Doe" vs "john doe" → SAME (case-insensitive)
4. **Context Awareness**: "Name" on different sites might be same person → duplicate
5. **Typos/Variations**: Handle minor question differences ("What's your name?" = "What is your name?")

**Categorization Rules** (for create/update operations):

- **contact**: Email, phone, social media handles, messaging IDs
- **location**: Addresses, cities, countries, postal codes
- **personal**: Names, birthdays, gender, personal details, hobbies
- **work**: Job titles, companies, salary, work experience
- **education**: Schools, degrees, certifications, GPA
- **general**: Anything that doesn't fit above

**Tags** (1-5 lowercase words):
- Descriptive keywords like: "email", "phone", "address", "name", "birthday"
- Be specific: For "Software Engineer", tags might be ["job", "title", "engineering"]

**Confidence Scoring** (0-1):
- 0.9-1.0: Extremely confident (exact semantic match or clear new field)
- 0.7-0.9: Very confident (high similarity)
- 0.5-0.7: Moderately confident (some ambiguity)
- Below 0.5: Low confidence (will be filtered out)

**Examples**:

**Example 1: Exact Duplicate (Skip)**
New Field: { index: 0, question: "Email Address", answer: "user@example.com" }
Existing: { id: "abc", question: "Email", answer: "user@example.com" }
→ { action: "skip", fieldIndex: 0, existingMemoryId: "abc", reasoning: "Identical email, no change needed" }

**Example 2: Answer Changed (Update)**
New Field: { index: 1, question: "Phone Number", answer: "+1-555-0123" }
Existing: { id: "def", question: "Phone", answer: "+1-555-9999" }
→ { action: "update", fieldIndex: 1, existingMemoryId: "def", newAnswer: "+1-555-0123", category: "contact", tags: ["phone", "contact"], confidence: 0.95 }

**Example 3: Unique Field (Create)**
New Field: { index: 2, question: "LinkedIn Profile", answer: "linkedin.com/in/johndoe" }
Existing: No matching memory
→ { action: "create", fieldIndex: 2, category: "contact", tags: ["linkedin", "social", "profile"], confidence: 0.9 }

**Example 4: Semantic Duplicate with Different Wording**
New Field: { index: 3, question: "What's your e-mail?", answer: "jane@work.com" }
Existing: { id: "ghi", question: "Email address", answer: "jane@work.com" }
→ { action: "skip", fieldIndex: 3, existingMemoryId: "ghi", reasoning: "Same email despite different question wording" }

**Critical**: You MUST return exactly ONE operation per new field, in order by fieldIndex.`;
  }

  private buildUserPrompt(
    newFields: FieldToProcess[],
    existingMemories: MemoryEntry[],
  ): string {
    const newFieldsSection = newFields
      .map(
        (field) =>
          `  ${field.index}. Question: "${field.question}"\n     Answer: "${field.answer}"\n     Purpose: ${field.fieldPurpose || "unknown"}`,
      )
      .join("\n\n");

    const existingMemoriesSection =
      existingMemories.length > 0
        ? existingMemories
            .map(
              (mem) =>
                `  - ID: ${mem.id}\n    Question: "${mem.question || "N/A"}"\n    Answer: "${mem.answer}"\n    Category: ${mem.category}\n    Purpose: ${mem.metadata?.fieldPurpose || "unknown"}`,
            )
            .join("\n\n")
        : "  (No existing memories)";

    return `Analyze these new form fields and determine which are duplicates of existing memories.

**New Fields** (${newFields.length} total):
${newFieldsSection}

**Existing Memories** (${existingMemories.length} total):
${existingMemoriesSection}

For each new field (index 0 to ${newFields.length - 1}), determine if it's a create, update, or skip operation.`;
  }

  private filterLowConfidenceOperations(
    result: DeduplicationResult,
  ): DeduplicationResult {
    const filtered = result.operations.filter((op) => {
      if (op.action === "skip") {
        return true;
      }

      if (op.confidence < MIN_CONFIDENCE_THRESHOLD) {
        logger.warn(
          `Filtering out low-confidence ${op.action} operation for field ${op.fieldIndex}:`,
          {
            confidence: op.confidence,
            reasoning: op.reasoning,
          },
        );
        return false;
      }

      return true;
    });

    return { operations: filtered };
  }

  private fallbackDeduplication(
    newFields: FieldToProcess[],
    existingMemories: MemoryEntry[],
  ): DeduplicationResult {
    logger.debug("Using fallback exact-match deduplication");

    const operations: DeduplicationOperation[] = [];

    for (const field of newFields) {
      const normalizedQuestion = this.normalizeString(field.question);
      const normalizedAnswer = this.normalizeString(field.answer);

      let matched = false;

      for (const memory of existingMemories) {
        if (!memory.question) continue;

        const memNormalizedQ = this.normalizeString(memory.question);
        const memNormalizedA = this.normalizeString(memory.answer);

        if (memNormalizedQ === normalizedQuestion) {
          if (memNormalizedA === normalizedAnswer) {
            operations.push({
              action: "skip",
              fieldIndex: field.index,
              existingMemoryId: memory.id,
              reasoning: "Exact match (fallback)",
            });
          } else {
            operations.push({
              action: "update",
              fieldIndex: field.index,
              existingMemoryId: memory.id,
              newAnswer: field.answer,
              category: "general",
              tags: ["general"],
              confidence: 0.5,
              reasoning: "Answer changed (fallback)",
            });
          }
          matched = true;
          break;
        }
      }

      if (!matched) {
        operations.push({
          action: "create",
          fieldIndex: field.index,
          category: "general",
          tags: ["general"],
          confidence: 0.5,
          reasoning: "New field (fallback)",
        });
      }
    }

    return { operations };
  }

  private normalizeString(str: string): string {
    return str.toLowerCase().trim().replace(/\s+/g, " ");
  }
}
