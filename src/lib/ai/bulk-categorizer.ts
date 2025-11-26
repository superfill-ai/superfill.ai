import { generateObject } from "ai";
import { z } from "zod";
import { getAIModel } from "@/lib/ai/model-factory";
import { allowedCategories } from "@/lib/copies";
import { createLogger } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";

const logger = createLogger("bulk-categorizer");

const CategorySchema = z.enum(allowedCategories as [string, ...string[]]);

const BulkCategorizationResultSchema = z.object({
  categories: z.array(
    z.object({
      index: z.number().describe("The index of the field in the input array"),
      category: CategorySchema.describe(
        "The suggested category for this field",
      ),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("Confidence in this categorization (0-1)"),
    }),
  ),
});

type BulkCategorizationResult = z.infer<typeof BulkCategorizationResultSchema>;

export interface CategorizedField {
  category: string;
  confidence: number;
}

export class BulkCategorizer {
  async categorizeFields(
    fields: Array<{ question: string; answer: string }>,
    provider: AIProvider,
    apiKey: string,
    modelName?: string,
  ): Promise<CategorizedField[]> {
    if (fields.length === 0) {
      logger.info("No fields to categorize");
      return [];
    }

    try {
      const startTime = performance.now();

      const model = getAIModel(provider, apiKey, modelName);

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(fields);

      logger.info(`Bulk categorizing ${fields.length} fields with ${provider}`);

      const { object: result } = await generateObject({
        model,
        schema: BulkCategorizationResultSchema,
        system: systemPrompt,
        prompt: userPrompt,
      });

      const categorized = this.mapResultsToFields(result, fields);

      const elapsed = performance.now() - startTime;
      logger.info(
        `Bulk categorization completed in ${elapsed.toFixed(2)}ms for ${fields.length} fields`,
      );

      return categorized;
    } catch (error) {
      logger.error("Bulk categorization failed:", error);
      return fields.map(() => ({
        category: "general",
        confidence: 0.3,
      }));
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert at categorizing form field data into predefined categories.

Your task is to analyze form field question-answer pairs and assign the most appropriate category to each.

Available Categories:
- **contact**: Email, phone, social media handles, contact preferences
- **general**: Miscellaneous information that doesn't fit other categories
- **location**: Addresses, cities, states, countries, zip codes
- **work**: Job titles, company names, work experience, employment info
- **personal**: Names, birthdays, gender, personal preferences, bio
- **education**: Schools, degrees, majors, graduation dates, academic info

Important Rules:
1. **Be consistent**: Similar fields should get the same category
2. **Use context**: Consider both the question and answer together
3. **High confidence**: Only assign high confidence (>0.7) when you're certain
4. **Default to general**: When unclear, use "general" with low confidence
5. **Professional data**: LinkedIn profiles, resume info → "work" or "personal" depending on the field

Output Format:
- Return an array of categorizations, one per input field
- Each categorization has: index (matching input), category, and confidence
- Confidence should reflect how certain you are (0 = guessing, 1 = completely certain)`;
  }

  private buildUserPrompt(
    fields: Array<{ question: string; answer: string }>,
  ): string {
    const fieldsMarkdown = fields
      .map(
        (f, idx) => `
**Field ${idx}**
- Question: ${f.question}
- Answer: ${f.answer.substring(0, 100)}${f.answer.length > 100 ? "..." : ""}`,
      )
      .join("\n");

    return `Categorize the following form fields into the predefined categories.

${fieldsMarkdown}

For each field, determine:
1. The most appropriate category from the available list
2. Your confidence in that categorization (0-1)

Remember to be consistent with similar fields and consider the context of both question and answer.`;
  }

  private mapResultsToFields(
    result: BulkCategorizationResult,
    fields: Array<{ question: string; answer: string }>,
  ): CategorizedField[] {
    const categorized: CategorizedField[] = new Array(fields.length)
      .fill(null)
      .map(() => ({
        category: "general",
        confidence: 0.3,
      }));

    for (const cat of result.categories) {
      if (cat.index >= 0 && cat.index < fields.length) {
        categorized[cat.index] = {
          category: cat.category,
          confidence: cat.confidence,
        };
      }
    }

    return categorized;
  }
}
