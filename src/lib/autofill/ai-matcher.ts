import { updateActiveObservation, updateActiveTrace } from "@langfuse/tracing";
import { trace } from "@opentelemetry/api";
import { generateObject } from "ai";
import { z } from "zod";
import { getAIModel } from "@/lib/ai/model-factory";
import { createLogger } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import type {
  CompressedFieldData,
  CompressedMemoryData,
  FieldMapping,
} from "@/types/autofill";
import type { WebsiteContext } from "@/types/context";
import { langfuseSpanProcessor } from "../observability/langfuse";
import { MIN_MATCH_CONFIDENCE } from "./constants";
import { FallbackMatcher } from "./fallback-matcher";
import { createEmptyMapping, roundConfidence } from "./mapping-utils";

const logger = createLogger("ai-matcher");

const AIMatchSchema = z.object({
  fieldOpid: z.string().describe("The field operation ID being matched"),
  memoryId: z
    .string()
    .nullable()
    .describe("ID of the best matching memory, or null if no good match"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score for this match (0-1)"),
  reasoning: z
    .string()
    .describe("Explanation of why this memory was selected or rejected"),
  alternativeMemoryIds: z
    .array(z.string())
    .max(3)
    .describe("Up to 3 alternative memory IDs that could also match"),
  rephrasedAnswer: z
    .string()
    .nullable()
    .optional()
    .describe(
      "The rephrased answer, if the context requires it. Otherwise, this should be null.",
    ),
});

const AIBatchMatchSchema = z.object({
  matches: z.array(AIMatchSchema).describe("Array of field-to-memory matches"),
  reasoning: z
    .string()
    .optional()
    .describe("Overall reasoning about the matching strategy used"),
});

type AIBatchMatchResult = z.infer<typeof AIBatchMatchSchema>;

export class AIMatcher {
  private fallbackMatcher: FallbackMatcher;

  constructor() {
    this.fallbackMatcher = new FallbackMatcher();
  }

  async matchFields(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
    websiteContext: WebsiteContext,
    provider: AIProvider,
    apiKey: string,
    modelName?: string,
  ): Promise<FieldMapping[]> {
    if (fields.length === 0) {
      logger.info("No fields to match");
      return [];
    }

    if (memories.length === 0) {
      logger.info("No memories available for matching");
      return fields.map((field) =>
        createEmptyMapping<CompressedFieldData, FieldMapping>(
          field,
          "No memories available",
        ),
      );
    }

    try {
      const startTime = performance.now();
      const aiResults = await this.performAIMatching(
        fields,
        memories,
        websiteContext,
        provider,
        apiKey,
        modelName,
      );
      const mappings = this.convertAIResultsToMappings(
        aiResults,
        fields,
        memories,
      );

      const elapsed = performance.now() - startTime;
      logger.info(
        `AI matching completed in ${elapsed.toFixed(2)}ms for ${fields.length} fields`,
      );

      return mappings;
    } catch (error) {
      logger.error("AI matching failed, falling back to rule-based:", error);
      return await this.fallbackMatcher.matchFields(fields, memories);
    }
  }

  private async performAIMatching(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
    websiteContext: WebsiteContext,
    provider: AIProvider,
    apiKey: string,
    modelName?: string,
  ): Promise<AIBatchMatchResult> {
    try {
      const model = getAIModel(provider, apiKey, modelName);

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(fields, memories, websiteContext);

      logger.info(`AI matching with ${provider} for ${fields.length} fields`, {
        websiteContext,
      });

      updateActiveObservation({
        input: { fields, memories, provider },
      });
      updateActiveTrace({
        name: "superfill:memory-categorization",
        input: { fields, memories, provider },
      });

      const result = await generateObject({
        model,
        schema: AIBatchMatchSchema,
        schemaName: "FieldMemoryMatches",
        schemaDescription:
          "Mapping of form fields to stored memory entries based on semantic similarity",
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.3,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "field-matching",
          metadata: {
            fieldCount: fields.length,
            fields: JSON.stringify(fields),
            memoryCount: memories.length,
            memories: JSON.stringify(memories),
            provider,
          },
        },
      });

      updateActiveObservation({
        output: result.object,
      });
      updateActiveTrace({
        output: result.object,
      });
      trace.getActiveSpan()?.end();

      return result.object;
    } catch (error) {
      logger.error("AI matching failed:", error);

      updateActiveObservation({
        output: error,
        level: "ERROR",
      });
      updateActiveTrace({
        output: error,
      });
      trace.getActiveSpan()?.end();

      throw error;
    } finally {
      (async () => await langfuseSpanProcessor.forceFlush())();
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert form-filling assistant that matches form fields to stored user memories.

    Your task is to analyze form fields and determine which stored memory entry (if any) best matches each field.

    Matching Criteria:
    1. **Semantic Similarity**: The field's purpose should align with the memory's content
    2. **Context Alignment**: Field labels, placeholders, and helper text should relate to the memory's question/category
    3. **Type Compatibility**: Email fields need email memories, phone fields need phone memories, etc.
    4. **Confidence Scoring**: Only suggest matches you're confident about (0.5+ confidence)
    5. **Website Context is KING**: The website's type and purpose heavily influence the meaning of a field.

    **CRUCIAL**: Use the provided Website Context to understand the form's purpose. A field labeled "Name" on a 'job_portal' is for a person's name, but on an 'e-commerce' site during checkout, it might be for a credit card name.

    Important Rules:
    1.  **Rephrasing**: If a stored answer is long or informal, and the website context requires a shorter or more professional tone, provide a 'rephrasedAnswer'. Otherwise, **leave 'rephrasedAnswer' as null**.
        - DO NOT rephrase simple values like names, emails, or phone numbers.
        - DO rephrase long "Bio" answers for shorter fields, or adjust the tone for professional vs. social sites.
    2.  **Matching**: Set 'memoryId' to null if no good match exists (confidence < 0.35).
    3.  **Reasoning**: Provide clear reasoning for each match, rejection, or rephrasing decision.
    4. **NEVER** match password fields (they should have been filtered out already)
    5. Consider field purpose, labels, and context together

    Output Format:
    - Return an array of matches, one per field
    - Include confidence scores (0-1) for match quality
    - Explain your reasoning concisely
    - Suggest alternatives when multiple memories could fit`;
  }

  private buildUserPrompt(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
    websiteContext: WebsiteContext,
  ): string {
    const fieldsMarkdown = fields
      .map(
        (f, idx) => `
          **Field ${idx + 1}**
          - opid: ${f.opid}
          - type: ${f.type}
          - purpose: ${f.purpose}
          - labels: ${f.labels.filter(Boolean).join(", ") || "none"}
          - context: ${f.context || "none"}`,
      )
      .join("\n");

    const memoriesMarkdown = memories
      .map(
        (m, idx) => `
          **Memory ${idx + 1}**
          - id: ${m.id}
          - question: ${m.question || "none"}
          - answer: ${m.answer.substring(0, 100)}
          - category: ${m.category}`,
      )
      .join("\n");

    const contextMarkdown = `
                **Website Type**: ${websiteContext.websiteType}
                **Inferred Form Purpose**: ${websiteContext.formPurpose}
                **Page Title**: ${websiteContext.metadata.title}
                `;

    return `Based on the following website context, match the form fields to the best stored memories.

          ## Website Context
          ${contextMarkdown}


          ## Form Fields
          ${fieldsMarkdown}

          ## Available Memories
          ${memoriesMarkdown}

          For each field, determine:
          1. Which memory (if any) is the best match
          2. Your confidence in that match (0-1)
          3. Why you chose that memory (or why no memory fits)
          4. A 'rephrasedAnswer' ONLY if the context requires it, otherwise null.
          5. Up to 3 alternative memories that could also work.`;
  }

  private convertAIResultsToMappings(
    aiResults: AIBatchMatchResult,
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
  ): FieldMapping[] {
    const memoryMap = new Map(memories.map((m) => [m.id, m]));
    const fieldMap = new Map(fields.map((f) => [f.opid, f]));

    return aiResults.matches.map((aiMatch) => {
      const field = fieldMap.get(aiMatch.fieldOpid);
      if (!field) {
        logger.warn(
          `AI returned match for unknown field: ${aiMatch.fieldOpid}`,
        );
        return createEmptyMapping<{ opid: string }, FieldMapping>(
          { opid: aiMatch.fieldOpid },
          "Field not found",
        );
      }

      const memory = aiMatch.memoryId ? memoryMap.get(aiMatch.memoryId) : null;
      const alternativeMatches = aiMatch.alternativeMemoryIds
        .map((memId) => {
          const altMemory = memoryMap.get(memId);
          if (!altMemory) return null;

          return {
            memoryId: altMemory.id,
            value: altMemory.answer,
            confidence: Math.max(0, aiMatch.confidence - 0.1),
          };
        })
        .filter((alt): alt is NonNullable<typeof alt> => alt !== null);

      const confidence = roundConfidence(aiMatch.confidence);
      const meetsThreshold = confidence >= MIN_MATCH_CONFIDENCE;

      const originalAnswer = meetsThreshold && memory ? memory.answer : null;
      const rephrasedAnswer = aiMatch.rephrasedAnswer || null;
      const useRephrased = !!rephrasedAnswer;

      return {
        fieldOpid: aiMatch.fieldOpid,
        memoryId: meetsThreshold && memory ? memory.id : null,
        value: originalAnswer,
        rephrasedValue: useRephrased ? rephrasedAnswer : null,
        isRephrased: useRephrased,
        confidence,
        reasoning:
          aiMatch.reasoning ||
          (useRephrased
            ? "AI-powered match with contextual rephrasing."
            : "AI-powered semantic match."),
        alternativeMatches,
      };
    });
  }
}
