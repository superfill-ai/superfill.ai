import { updateActiveObservation, updateActiveTrace } from "@langfuse/tracing";
import { trace } from "@opentelemetry/api";
import { generateObject } from "ai";
import { z } from "zod";
import { getAIModel } from "@/lib/ai/model-factory";
import { createLogger, DEBUG } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import type {
  CompressedFieldData,
  CompressedMemoryData,
  FieldMapping,
} from "@/types/autofill";
import type { WebsiteContext } from "@/types/context";
import { langfuseSpanProcessor } from "../observability/langfuse";
import { FallbackMatcher } from "./fallback-matcher";
import { createEmptyMapping, roundConfidence } from "./mapping-utils";

const logger = createLogger("ai-matcher");

const AIMatchSchema = z.object({
  fieldOpid: z.string().describe("The field operation ID being matched"),
  value: z
    .string()
    .nullable()
    .describe(
      "The answer to fill into the field. This can be from a memory, combined from multiple memories, or rephrased. Null if no suitable answer is found.",
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
        updateActiveObservation({
          input: { fields, memories, provider },
        });
        updateActiveTrace({
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
        updateActiveObservation({
          output: result.object,
        });
        updateActiveTrace({
          output: result.object,
        });
        trace.getActiveSpan()?.end();
      }

      return result.object;
    } catch (error) {
      logger.error("AI matching failed:", error);

      if (DEBUG) {
        updateActiveObservation({
          output: error,
          level: "ERROR",
        });
        updateActiveTrace({
          output: error,
        });
        trace.getActiveSpan()?.end();
      }

      throw error;
    } finally {
      if (DEBUG) {
        (async () => await langfuseSpanProcessor.forceFlush())();
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
    
    **CRUCIAL**: Use the provided Website Context to understand the form's purpose. A field labeled "Name" on a 'job_portal' is for a person's name, but on an 'e-commerce' site during checkout, it might be for a credit card name.
    
    Important Rules:
    1. **Rephrasing**: If a stored answer is long or informal, and the website context requires a shorter or more professional tone, provide a 'rephrasedAnswer'. 
    2. **Matching**: Set 'value' to null if no good match exists (confidence < 0.35).
    3. **Reasoning**: Provide clear reasoning for each match, rejection, or rephrasing decision.
    4. **NEVER** match password fields (they should have been filtered out already)
    5. Consider field purpose, labels, and context together
    6. **Handle Compound Data - SPLITTING**: For data like names or addresses, analyze the field's purpose. If the original answer is a full name and the field asks for a specific part (e.g., 'First Name'), extract only that part. Do not return the full answer.
    7. **Handle Compound Data - COMBINING**: For compound fields (e.g., 'Full Name', 'Complete Address'), combine multiple related memories intelligently:
        - For 'Full Name' fields: Combine 'First Name' + 'Middle Name' (if exists) + 'Last Name'.
        - For 'Complete Address' fields: Combine 'Street' + 'City' + 'State' + 'ZIP' + 'Country' as appropriate.
        - The final combined string should be placed in the 'value' field.
        - Only combine memories when the field explicitly asks for compound data.
    8. **Generate for Generic Fields**: If no memory exists but field can be answered generically

    ### Fields that CANNOT be generated:
    - Personal information (name, email, phone, address)
    - Specific dates (birth date, graduation date)
    - Numbers (salary, years of experience, GPA)
    - Unique identifiers (SSN, passport, license numbers)
    - Specific preferences without context (favorite color, hobbies)
    - Technical skills or qualifications
    - Work history or education details

    ### DO NOT Rephrase:
    - Tone adjustments (unless explicitly required by form validation)
    - Shortening long text (user can edit if needed)
    - Capitalization changes (unless part of URL formatting)
    - Minor rewording for "professionalism"
    - Adding punctuation or formatting
    - Any change that doesn't extract, combine, or standardize format
  
    **Complex Field Examples**:
    
    *Example 1: Tone & Brevity*
    - Original Answer: "I am a skilled software engineer with 5 years of experience in React and Node.js."
    - Field: "Short Bio" on a 'social' network.
    - 'value': "Software engineer, 5 years with React & Node.js."
    
    *Example 2: Splitting Name Data*
    - Original Answer: "John Fitzgerald Doe"
    - Field Context: Field Purpose is 'name.first', Field Label is 'First Name'
    - 'value': "John"
    - Original Answer: "John Fitzgerald Doe"
    - Field Context: Field Purpose is 'name.last', Field Label is 'Last Name'
    - 'value': "Doe"
    
    *Example 3: COMBINING Name Data*
    - Memory 1: "John" (category: 'name.first')
    - Memory 2: "Fitzgerald" (category: 'name.middle')
    - Memory 3: "Doe" (category: 'name.last')
    - Field Context: Field Purpose is 'name.full', Field Label is 'Full Name' or 'Complete Name'
    - 'value': "John Fitzgerald Doe"
    
    *Example 4: COMBINING Address Data*
    - Memory 1: "123 Main St" (category: 'address.street')
    - Memory 2: "Anytown" (category: 'address.city')
    - Memory 3: "CA" (category: 'address.state')
    - Memory 4: "94105" (category: 'address.zip')
    - Field Context: Field Purpose is 'address.full', Field Label is 'Full Address' or 'Complete Address'
    - 'value': "123 Main St, Anytown, CA 94105"
    
    *Example 5: Splitting Address Data*
    - Original Answer: "123 Main St, Anytown, CA 94105, USA"
    - Field Context: Field Purpose is 'address.street', Field Label is 'Street Address'
    - 'value': "123 Main St"
    - Original Answer: "123 Main St, Anytown, CA 94105, USA"
    - Field Context: Field Purpose is 'address.city', Field Label is 'City'
    - 'value': "Anytown"
    
    *Example 6: Email Purpose*
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
    `;
  }

  private buildUserPrompt(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
    websiteContext: WebsiteContext,
    domContext?: string,
  ): string {
    const fieldsMarkdown = fields
      .map((f, idx) => {
        const parts = [
          `**Field ${idx + 1}**`,
          `- fieldOpid: ${f.fieldOpid}`,
          `- type: ${f.type}`,
          `- purpose: ${f.purpose}`,
          `- label: ${f.label || "none"}`,
          `- context: ${f.context || "none"}`,
        ];

        switch (f.type) {
          case "select":
            if (f.options && f.options.length > 0) {
              parts.push(
                `- options: [${f.options.map((o) => `"${o}"`).join(", ")}]`,
              );
              parts.push(
                `This is a SELECT field. The 'value' MUST be an exact string from the 'options' list.`,
              );
            } else {
              parts.push(
                `This is a SELECT field, but no options were provided. Set value to null.`,
              );
            }
            break;

          case "radio":
            if (f.radioGroup) {
              parts.push(`- radioGroup: "${f.radioGroup.name}"`);
              parts.push(
                `- radioValues: [${f.radioGroup.values.map((v) => `"${v}"`).join(", ")}]`,
              );
              parts.push(
                `This is a RADIO button. The 'value' MUST be an exact string from the 'radioValues' list.`,
              );
            } else {
              parts.push(
                `This is a RADIO button, but no values were provided. Set value to null.`,
              );
            }
            break;

          case "checkbox":
            parts.push(`- currentlyChecked: ${f.isChecked ?? false}`);
            parts.push(
              `This is a CHECKBOX. The 'value' MUST be "true" (to check) or "false" (to uncheck).`,
            );
            break;
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

    // Include DOM context if available
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
          4. The answer in the 'value' field ONLY if the context requires it, otherwise null.`;
  }

  private convertAIResultsToMappings(
    aiResults: AIBatchMatchResult,
    fields: CompressedFieldData[],
  ): FieldMapping[] {
    const fieldMap = new Map(fields.map((f) => [f.opid, f]));

    return aiResults.matches.map((aiMatch) => {
      const field = fieldMap.get(aiMatch.fieldOpid);
      if (!field) {
        logger.warn(
          `AI returned match for unknown field: ${aiMatch.fieldOpid}`,
        );
        return createEmptyMapping<
          { fieldOpid: string; selector: string },
          FieldMapping
        >({ fieldOpid: aiMatch.fieldOpid, selector: "" }, "Field not found");
      }

      const confidence = roundConfidence(aiMatch.confidence);
      const value = aiMatch.value;

      return {
        fieldOpid: aiMatch.fieldOpid,
        value,
        confidence,
        reasoning:
          aiMatch.reasoning ||
          "AI-powered semantic match and value generation.",
      };
    });
  }
}
