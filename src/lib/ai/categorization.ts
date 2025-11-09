import { updateActiveObservation, updateActiveTrace } from "@langfuse/tracing";
import { trace } from "@opentelemetry/api";
import { generateObject } from "ai";
import { z } from "zod";
import { getAIModel } from "@/lib/ai/model-factory";
import { createLogger } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import { langfuseSpanProcessor } from "../observability/langfuse";

const logger = createLogger("ai:categorization");

export const CategoryEnum = z.enum([
  "contact",
  "location",
  "personal",
  "work",
  "education",
  "general",
]);

export const TagSchema = z.string().min(2).max(50).lowercase();

export const AnalysisResultSchema = z.object({
  category: CategoryEnum,
  tags: z.array(TagSchema).min(1).max(5),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const RephraseResultSchema = z.object({
  rephrasedQuestion: z
    .string()
    .describe("A clear, well-formulated question based on the answer."),
  rephrasedAnswer: z
    .string()
    .describe("A refined and clear version of the original answer."),
});
export type RephraseResult = z.infer<typeof RephraseResultSchema>;
export type Category = z.infer<typeof CategoryEnum>;

export const fallbackCategorization = async (
  answer: string,
  question?: string,
): Promise<AnalysisResult> => {
  const lower = answer.toLowerCase();
  const text = `${question || ""} ${answer}`.toLowerCase();
  let category: Category = "general";
  const tags: string[] = [];

  if (z.email().safeParse(answer).success) category = "contact";
  if (z.e164().safeParse(answer).success) category = "contact";
  if (
    lower.includes("address") ||
    lower.includes("street") ||
    lower.includes("city")
  )
    category = "location";
  if (
    lower.includes("birthday") ||
    lower.includes("born") ||
    lower.includes("date of birth")
  )
    category = "personal";
  if (
    lower.includes("company") ||
    lower.includes("employer") ||
    lower.includes("job")
  )
    category = "work";
  if (
    lower.includes("education") ||
    lower.includes("university") ||
    lower.includes("degree")
  )
    category = "education";
  if (lower.includes("name")) category = "personal";

  const tagMap: Record<string, string[]> = {
    email: ["email", "contact"],
    phone: ["phone", "contact"],
    address: ["address", "location"],
    work: ["work", "employment"],
    education: ["education", "academic"],
    personal: ["personal", "info"],
    name: ["name", "personal"],
    date: ["date", "time"],
  };

  for (const [key, tagValues] of Object.entries(tagMap)) {
    if (text.includes(key)) {
      tags.push(...tagValues);
    }
  }

  const uniqueTags = [...new Set(tags)];
  if (uniqueTags.length === 0) {
    uniqueTags.push(category);
  }

  return {
    category,
    tags: uniqueTags.slice(0, 5),
    confidence: 0.3,
    reasoning: "Fallback rule-based categorization",
  };
};

export const categorizationAgent = async (
  answer: string,
  question: string | undefined,
  provider: AIProvider,
  apiKey: string,
  modelName?: string,
): Promise<AnalysisResult> => {
  try {
    const model = getAIModel(provider, apiKey, modelName);

    const systemPrompt = `You are a data categorization expert. Your task is to analyze user input and determine:
1. The most appropriate category from: contact, location, personal, work, education, or general
2. Relevant tags (1-5 one worded tags in lowercase like: "email", "phone", "address", "work", "education", "books", "personal", "date", "time") that describe the information
3. Your confidence level (0-1) in this categorization

Be precise and consider context. For example:
- Email addresses, phone numbers → contact
- Addresses, cities, countries → location  
- Names, birthdays, personal details → personal
- Job titles, company names → work
- Degrees, schools, certifications → education
- Anything unclear → general`;

    const userPrompt = question
      ? `Question: ${question}\nAnswer: ${answer}`
      : `Information: ${answer}`;

    updateActiveObservation({
      input: { answer, question },
    });
    updateActiveTrace({
      name: "superfill:memory-categorization",
      input: { answer, question },
    });

    const result = await generateObject({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      schema: AnalysisResultSchema,
      schemaName: "CategorizationResult",
      schemaDescription: "Categorization and tagging result for user data",
      temperature: 0.3,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "memory-categorization",
        metadata: {
          hasQuestion: !!question,
          answerLength: answer.length,
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
    logger.error("AI categorization failed:", error);

    updateActiveObservation({
      output: error,
      level: "ERROR",
    });
    updateActiveTrace({
      output: error,
    });
    trace.getActiveSpan()?.end();

    return fallbackCategorization(answer, question);
  } finally {
    (async () => await langfuseSpanProcessor.forceFlush())();
  }
};

export const rephraseAgent = async (
  answer: string,
  question: string | undefined,
  provider: AIProvider,
  apiKey: string,
  modelName?: string,
): Promise<RephraseResult> => {
  try {
    const model = getAIModel(provider, apiKey, modelName);

    const systemPrompt = `You are an expert in clarity and conciseness. Your task is to rephrase a user's question and answer to be more clear, professional, and easily searchable.
- For the question, create a clear, interrogative sentence that accurately represents the data in the answer. If no question is provided, infer one.
- For the answer, refine it for clarity and consistency without losing the original meaning. Correct any typos or grammatical errors.
- Return the rephrased content.`;

    const userPrompt = `Original Question: "${question || "Not provided"}"\nOriginal Answer: "${answer}"`;

    updateActiveObservation({
      input: { answer, question },
    });
    updateActiveTrace({
      name: "superfill:memory-rephrase",
      input: { answer, question },
    });

    const { object } = await generateObject({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      schema: RephraseResultSchema,
      schemaName: "RephraseResult",
      schemaDescription: "Rephrased question and answer for user data",
      temperature: 0.5,
    });

    updateActiveObservation({
      output: object,
    });
    updateActiveTrace({
      output: object,
    });
    trace.getActiveSpan()?.end();

    return object;
  } catch (error) {
    logger.error("AI rephrasing failed:", error);

    updateActiveObservation({
      output: error,
      level: "ERROR",
    });
    updateActiveTrace({
      output: error,
    });
    trace.getActiveSpan()?.end();

    throw new Error("Failed to rephrase content with AI.");
  } finally {
    (async () => await langfuseSpanProcessor.forceFlush())();
  }
};

export const batchCategorization = async (
  entries: Array<{ answer: string; question?: string }>,
  provider: "openai" | "anthropic",
  apiKey: string,
): Promise<AnalysisResult[]> => {
  // For now, process sequentially. Future: implement proper batching
  const results: AnalysisResult[] = [];

  for (const entry of entries) {
    try {
      const result = await categorizationAgent(
        entry.answer,
        entry.question,
        provider,
        apiKey,
      );
      results.push(result);
    } catch (error) {
      logger.error("Batch categorization error:", error);
      results.push(await fallbackCategorization(entry.answer, entry.question));
    }
  }

  return results;
};
