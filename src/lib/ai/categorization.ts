import { generateObject } from "ai";
import { z } from "zod";
import { getAIModel } from "@/lib/ai/model-factory";
import { createLogger, DEBUG } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import type { CompressedFieldData } from "@/types/autofill";
import type { WebsiteContext } from "@/types/context";
import {
  endActiveSpan,
  flushSpanProcessor,
  updateObservation,
  updateTrace,
} from "../observability/telemetry-helpers";

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

export const RephrasedAnswerSchema = z.object({
  rephrasedAnswer: z
    .string()
    .describe(
      "The rephrased answer, tailored to the specific context of the form field and website.",
    ),
});
export type RephrasedAnswer = z.infer<typeof RephrasedAnswerSchema>;
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

    if (DEBUG) {
      await updateObservation({
        input: { answer, question },
      });
      await updateTrace({
        name: "superfill:memory-categorization",
        input: { answer, question },
      });
    }

    const result = await generateObject({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      schema: AnalysisResultSchema,
      schemaName: "CategorizationResult",
      schemaDescription: "Categorization and tagging result for user data",
      temperature: 0.3,
      experimental_telemetry: {
        isEnabled: DEBUG,
        functionId: "memory-categorization",
        metadata: {
          hasQuestion: !!question,
          answerLength: answer.length,
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
    logger.error("AI categorization failed:", error);

    if (DEBUG) {
      await updateObservation({
        output: error,
        level: "ERROR",
      });
      await updateTrace({
        output: error,
      });
      await endActiveSpan();
    }

    return fallbackCategorization(answer, question);
  } finally {
    if (DEBUG) {
      await flushSpanProcessor();
    }
  }
};

export const rephraseAnswerForContextAgent = async (
  field: CompressedFieldData,
  originalAnswer: string,
  websiteContext: WebsiteContext,
  provider: AIProvider,
  apiKey: string,
  modelName?: string,
): Promise<string> => {
  try {
    const model = getAIModel(provider, apiKey, modelName);

    const systemPrompt = `You are an expert assistant that rephrases text to fit a specific context.
Your task is to take a user's stored answer and adapt it for a specific form field on a specific website.

**CRUCIAL RULES**:
1.  **Analyze the Context**: Use the Website and Field context to understand the required tone (professional, casual), length, and format.
2.  **Preserve Core Meaning**: The rephrased answer MUST retain the original answer's core information. DO NOT invent new facts or hallucinate information not present in the original answer.
3.  **Be Subtle**: If the original answer already fits well, make minimal or no changes. Only rephrase when the context clearly demands it. For example, a simple name or email address rarely needs rephrasing.
4.  **Focus on Tone and Format**: A long-form answer for a "Bio" on a professional site (job_portal) should be formal. The same answer for a "Bio" on a 'dating' site should be more casual and personal.
5.  **Handle Compound Data**: For data like names, analyze the field's purpose. If the original answer is a full name and the field asks for a specific part (e.g., 'First Name'), extract only that part. Do not return the full answer.

**Complex Field Examples**:

*Example 1: Tone & Brevity*
- Original Answer: "I am a skilled software engineer with 5 years of experience in React and Node.js."
- Field: "Short Bio" on a 'social' network.
- Rephrased Answer: "Software engineer, 5 years with React & Node.js."

*Example 2: Splitting Name Data*
- Original Answer: "John Fitzgerald Doe"
- Field Context: Field Purpose is 'name.first', Field Label is 'First Name'
- Rephrased Answer: "John"

- Original Answer: "John Fitzgerald Doe"
- Field Context: Field Purpose is 'name.last', Field Label is 'Last Name'
- Rephrased Answer: "Doe"

*Example 3: Splitting Address Data*
- Original Answer: "123 Main St, Anytown, CA 94105, USA"
- Field Context: Field Purpose is 'address.street', Field Label is 'Street Address'
- Rephrased Answer: "123 Main St"

- Original Answer: "123 Main St, Anytown, CA 94105, USA"
- Field Context: Field Purpose is 'address.city', Field Label is 'City'
- Rephrased Answer: "Anytown"

*Example 4: Email purpose*
- Original Answer: "user@example.com category: personal"
- Field Context: Field Purpose is 'email', Field Label is 'Personal Email'
- Rephrased Answer: "user@example.com"

- Original Answer: "user@work.com category: work"
- Field Context: Field Purpose is 'email', Field Label is 'Work Email'
- Rephrased Answer: "user@work.com"
`;

    const userPrompt = `
Rephrase the following answer based on the provided context.

**Original Answer**:
"${originalAnswer}"

**Website Context**:
- Website Type: ${websiteContext.websiteType}
- Form Purpose: ${websiteContext.formPurpose}
- Page Title: ${websiteContext.metadata.title}

**Field Context**:
- Field Label: ${field.labels.length > 0 ? field.labels.join(", ") : "N/A"}
- Field Purpose: ${field.purpose}
- Field Type: ${field.type}
`;

    const { object } = await generateObject({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      schema: RephrasedAnswerSchema,
      temperature: 0.4,
    });

    return object.rephrasedAnswer;
  } catch (error) {
    logger.error(
      "Contextual rephrasing failed, returning original answer:",
      error,
    );

    return originalAnswer;
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

    if (DEBUG) {
      await updateObservation({
        input: { answer, question },
      });
      await updateTrace({
        name: "superfill:memory-rephrase",
        input: { answer, question },
      });
    }

    const { object } = await generateObject({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      schema: RephraseResultSchema,
      schemaName: "RephraseResult",
      schemaDescription: "Rephrased question and answer for user data",
      temperature: 0.5,
    });

    if (DEBUG) {
      await updateObservation({
        output: object,
      });
      await updateTrace({
        output: object,
      });
      await endActiveSpan();
    }

    return object;
  } catch (error) {
    logger.error("AI rephrasing failed:", error);

    if (DEBUG) {
      await updateObservation({
        output: error,
        level: "ERROR",
      });
      await updateTrace({
        output: error,
      });
      await endActiveSpan();
    }

    throw new Error("Failed to rephrase content with AI.");
  } finally {
    if (DEBUG) {
      await flushSpanProcessor();
    }
  }
};
