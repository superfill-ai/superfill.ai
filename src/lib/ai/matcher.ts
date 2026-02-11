import { generateObject } from "ai";
import { z } from "zod";
import { getAuthService } from "@/lib/auth/auth-service";
import { FallbackMatcher } from "@/lib/autofill/fallback-matcher";
import {
  createEmptyMapping,
  roundConfidence,
} from "@/lib/autofill/mapping-utils";
import { createLogger, DEBUG } from "@/lib/logger";
import {
  endActiveSpan,
  flushSpanProcessor,
  updateObservation,
  updateTrace,
} from "@/lib/observability/telemetry-helpers";
import { getAIModel } from "@/lib/providers/model-factory";
import type { AIProvider } from "@/lib/providers/registry";
import type {
  CompressedFieldData,
  CompressedMemoryData,
  FieldMapping,
} from "@/types/autofill";
import type { WebsiteContext } from "@/types/context";

const logger = createLogger("ai-matcher");

const AIMatchSchema = z.object({
  highlightIndex: z
    .number()
    .describe("The highlight index [N] of the field being matched"),
  value: z
    .string()
    .nullable()
    .describe(
      "The answer to fill into the field. This can be from a memory, combined from multiple memories, or rephrased. Null if no suitable answer is found. For select fields, MUST be an exact option value.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score for this match (0-1)"),
  reasoning: z
    .string()
    .describe("Explanation of why this memory was selected or rejected"),
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
  private readonly API_URL =
    import.meta.env.WXT_WEBSITE_URL || "https://superfill.ai";

  constructor() {
    this.fallbackMatcher = new FallbackMatcher();
  }

  async matchFields(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
    websiteContext: WebsiteContext,
    useCloudMode: boolean,
    provider?: AIProvider,
    apiKey?: string,
    modelName?: string,
    domContext?: string,
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

      if (useCloudMode) {
        logger.debug("Using cloud AI models for matching");
        const cloudResults = await this.performCloudMatching(
          fields,
          memories,
          websiteContext,
        );
        const mappings = this.convertAIResultsToMappings(cloudResults, fields);
        const elapsed = performance.now() - startTime;
        logger.debug(
          `Cloud AI matching completed in ${elapsed.toFixed(2)}ms for ${fields.length} fields`,
        );
        return mappings;
      }

      if (!provider || !apiKey) {
        throw new Error("Provider and API key required for BYOK mode");
      }

      const aiResults = await this.performAIMatching(
        fields,
        memories,
        websiteContext,
        provider,
        apiKey,
        modelName,
        domContext,
      );
      const mappings = this.convertAIResultsToMappings(aiResults, fields);

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

  private async performCloudMatching(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
    websiteContext: WebsiteContext,
  ): Promise<AIBatchMatchResult> {
    try {
      const authService = getAuthService();
      const session = await authService.getSession();

      if (!session?.access_token) {
        throw new Error("Not authenticated - cannot use cloud models");
      }

      const url = `${this.API_URL}/routes/api/autofill/match`;

      logger.debug(`Calling cloud API: ${url}`, {
        fieldsCount: fields.length,
        memoriesCount: memories.length,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fields,
          memories,
          websiteContext,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Cloud API error:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new Error(
          `Cloud API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      return data as AIBatchMatchResult;
    } catch (error) {
      logger.error("Cloud matching failed:", error);
      throw error;
    }
  }

  private async performAIMatching(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
    websiteContext: WebsiteContext,
    provider: AIProvider,
    apiKey: string,
    modelName?: string,
    domContext?: string,
  ): Promise<AIBatchMatchResult> {
    try {
      const model = getAIModel(provider, apiKey, modelName);

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(
        fields,
        memories,
        websiteContext,
        domContext,
      );

      logger.info(`AI matching with ${provider} for ${fields.length} fields`, {
        websiteContext,
      });

      if (DEBUG) {
        await updateObservation({
          input: { fields, memories, provider },
        });
        await updateTrace({
          name: "superfill:memory-categorization",
          input: { fields, memories, provider },
        });
      }

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
          isEnabled: DEBUG,
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

      if (DEBUG) {
        await updateObservation({
          output: result.object,
        });
        await updateTrace({
          output: result.object,
        });
        await endActiveSpan();
      }

      return result.object;
    } catch (error) {
      logger.error("AI matching failed:", error);

      if (DEBUG) {
        try {
          await updateObservation({
            output: error,
            level: "ERROR",
          });
          await updateTrace({
            output: error,
          });
          await endActiveSpan();
        } catch (telemetryError) {
          logger.error("Telemetry error in matching catch:", telemetryError);
        }
      }

      throw error;
    } finally {
      if (DEBUG) {
        try {
          await flushSpanProcessor();
        } catch (telemetryError) {
          logger.error("Telemetry flush error in matching:", telemetryError);
        }
      }
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert form-filling assistant that matches form fields to stored user memories.
    Your task is to analyze form fields and determine which stored memory entry (or entries) best matches each field.
    
    Matching Criteria:
    1. **Semantic Similarity**: The field's purpose should align with the memory's content
    2. **Context Alignment**: Field labels, placeholders, and helper text should relate to the memory's question/category
    3. **Type Compatibility**: Email fields need email memories, phone fields need phone memories, etc.
    4. **Confidence Scoring**: Only suggest matches you're confident about (0.5+ confidence)
    5. **Website Context is KING**: The website's type and purpose heavily influence the meaning of a field.
    6. **DOM Context**: Use the provided serialized DOM context to understand field relationships, groupings, and form structure.
    
    **CRUCIAL**: Use the provided Website Context to understand the form's purpose. A field labeled "Name" on a 'job_portal' is for a person's name, but on an 'e-commerce' site during checkout, it might be for a credit card name.
    
    ## SELECT FIELDS (Dropdowns)
    For select/dropdown fields, you MUST:
    - Return a value that EXACTLY matches one of the provided options. The value must be one of the strings from the 'options' array for the field.
    - Match the user's memory to the closest option semantically.
    - If user's memory is "United States", and options are ["USA", "Canada", "UK"], return "USA".
    - If no option matches well or you are uncertain, you MUST set the value to null.
    
    Important Rules:
    1. **ALWAYS USE MEMORIES**: If a user has stored a memory that matches the field, USE IT. The whole point is to fill forms with user's stored data.
    2. **DERIVE FROM MEMORIES**: You can extract parts from stored memories (e.g., first name from full name, city from full address). This is encouraged.
    3. **Matching**: Set 'value' to null ONLY if no memory matches AND the data cannot be derived from existing memories.
    4. **Reasoning**: Provide clear reasoning for each match or derivation.
    5. **NEVER** match password fields (they should have been filtered out already)
    6. **Handle Compound Data - SPLITTING**: For data like names or addresses, analyze the field's purpose. If the original answer is a full name and the field asks for a specific part (e.g., 'First Name'), extract only that part.
    7. **Handle Compound Data - COMBINING**: For compound fields (e.g., 'Full Name', 'Complete Address'), combine multiple related memories intelligently.
    8. **EXACT OPTION MATCHING**: For select fields, ALWAYS return an exact option value from the provided options list, never the raw memory value.

    ### When NO relevant memory exists:
    Do NOT invent data - return null instead. The AI should never fabricate:
    - Personal information (name, email, phone, address)
    - Dates (birth date, graduation date)  
    - Numbers (salary, years of experience, GPA)
    - Unique identifiers (SSN, passport, license numbers)
    
    BUT if a memory exists that contains this information (even partially), USE IT or DERIVE from it.
  
    **Complex Field Examples**:
    
    *Example 1: SELECT Field - Country*
    - Memory: "United States of America"
    - Field type: select
    - Field options: ["USA", "Canada", "United Kingdom", "Australia"]
    - 'value': "USA" (exact match from options)
    
    *Example 2: Tone & Brevity*
    - Original Answer: "I am a skilled software engineer with 5 years of experience in React and Node.js."
    - Field: "Short Bio" on a 'social' network.
    - 'value': "Software engineer, 5 years with React & Node.js."
    
    *Example 3: Splitting Name Data*
    - Original Answer: "John Fitzgerald Doe"
    - Field Context: Field Purpose is 'name.first', Field Label is 'First Name'
    - 'value': "John"
    
    *Example 4: COMBINING Name Data*
    - Memory 1: "John" (category: 'name.first')
    - Memory 2: "Fitzgerald" (category: 'name.middle')
    - Memory 3: "Doe" (category: 'name.last')
    - Field Context: Field Purpose is 'name.full', Field Label is 'Full Name'
    - 'value': "John Fitzgerald Doe"

    *Example 5: COMBINING Address Data*
    - Memory 1: "123 Main St" (category: 'address.street')
    - Memory 2: "Anytown" (category: 'address.city')
    - Memory 3: "CA" (category: 'address.state')
    - Memory 4: "94105" (category: 'address.zip')
    - Field Context: Field Purpose is 'address.full', Field Label is 'Full Address' or 'Complete Address'
    - 'value': "123 Main St, Anytown, CA 94105"

    *Example 6: Splitting Address Data*
    - Original Answer: "123 Main St, Anytown, CA 94105, USA"
    - Field Context: Field Purpose is 'address.street', Field Label is 'Street Address'
    - 'value': "123 Main St"
    - Original Answer: "123 Main St, Anytown, CA 94105, USA"
    - Field Context: Field Purpose is 'address.city', Field Label is 'City'
    - 'value': "Anytown"

    *Example 7: Email Purpose*
    - Original Answer: "user@example.com category: personal"
    - Field Context: Field Purpose is 'email', Field Label is 'Personal Email'
    - 'value': "user@example.com"
    - Original Answer: "user@work.com category: work"
    - Field Context: Field Purpose is 'email', Field Label is 'Work Email'
    - 'value': "user@work.com"
    
    Output Format:
    - Return an array of matches, one per field
    - Include confidence scores (0-1) for match quality
    - Explain your reasoning concisely
    - For select fields, ALWAYS return exact option values
    `;
  }

  private buildUserPrompt(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
    websiteContext: WebsiteContext,
    domContext?: string,
  ): string {
    const fieldsMarkdown = fields
      .filter((f) => f.highlightIndex !== null)
      .map((f) => {
        const parts = [
          `**[${f.highlightIndex}]**`,
          `- type: ${f.type}`,
          `- purpose: ${f.purpose}`,
          `- labels: ${f.labels.length > 0 ? f.labels.join(", ") : "none"}`,
          `- context: ${f.context || "none"}`,
        ];

        if (f.options && f.options.length > 0) {
          const optionsList = f.options
            .map((opt) => `"${opt.value}"${opt.label ? ` (${opt.label})` : ""}`)
            .join(", ");
          parts.push(`- options: [${optionsList}]`);
        }

        return parts.join("\n          ");
      })
      .join("\n");

    const memoriesMarkdown = memories
      .map(
        (m, idx) => `
          **Memory ${idx + 1}**
          - question: ${m.question || "none"}
          - answer: ${m.answer}
          - category: ${m.category}`,
      )
      .join("\n");

    const contextMarkdown = `
**Website Type**: ${websiteContext.websiteType}
**Inferred Form Purpose**: ${websiteContext.formPurpose}
**Page Title**: ${websiteContext.metadata.title}
`;

    const domContextSection = domContext
      ? `
          ## Serialized Form DOM Structure
          Use this to understand field relationships and form layout:
          \`\`\`
          ${domContext}
          \`\`\`
          `
      : "";

    return `Based on the following website context, match the form fields to the best stored memories.

## Website Context
${contextMarkdown}

          ${domContextSection}

## Form Fields
${fieldsMarkdown}

## Available Memories
${memoriesMarkdown}

          For each field, determine:
          1. Which memory (if any) is the best match
          2. Your confidence in that match (0-1)
          3. Why you chose that memory (or why no memory fits)
          4. The answer in the 'value' field
          
          **CRITICAL for select fields**: Return EXACT option values from the provided lists, or null if no suitable option is found. DO NOT return the raw memory text.`;
  }

  private convertAIResultsToMappings(
    aiResults: AIBatchMatchResult,
    fields: CompressedFieldData[],
  ): FieldMapping[] {
    const seenIndices = new Set<number>();

    for (const field of fields) {
      if (field.highlightIndex !== null) {
        if (seenIndices.has(field.highlightIndex)) {
          logger.warn(
            `Duplicate highlightIndex detected: ${field.highlightIndex} (opid: ${field.opid})`,
          );
        }
        seenIndices.add(field.highlightIndex);
      }
    }

    const fieldByIndex = new Map(
      fields
        .filter((f) => f.highlightIndex !== null)
        .map((f) => [f.highlightIndex as number, f]),
    );

    return aiResults.matches.map((aiMatch) => {
      const field = fieldByIndex.get(aiMatch.highlightIndex);
      if (!field) {
        logger.warn(
          `AI returned match for unknown highlight index: [${aiMatch.highlightIndex}]`,
        );
        return createEmptyMapping<{ opid: string }, FieldMapping>(
          { opid: `__${aiMatch.highlightIndex}` },
          "Field not found",
        );
      }

      const confidence = roundConfidence(aiMatch.confidence);
      const value = aiMatch.value;

      return {
        fieldOpid: field.opid,
        value,
        confidence,
        reasoning:
          aiMatch.reasoning ||
          "AI-powered semantic match and value generation.",
      };
    });
  }
}
