import { z } from "zod";

export const CategoryEnum = z.enum([
  "contact",
  "location",
  "personal",
  "work",
  "education",
  "general",
]);
export type Category = z.infer<typeof CategoryEnum>;

export const TagSchema = z
  .string()
  .min(2)
  .max(50)
  .transform((val) => val.toLowerCase());

export const AnalysisResultSchema = z.object({
  category: CategoryEnum,
  tags: z.array(TagSchema).min(1).max(5),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const RephraseResultSchema = z.object({
  rephrasedQuestion: z.string(),
  rephrasedAnswer: z.string(),
});
export type RephraseResult = z.infer<typeof RephraseResultSchema>;

export const BulkCategorizationResultSchema = z.object({
  categories: z.array(
    z.object({
      index: z.number(),
      category: CategoryEnum,
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type BulkCategorizationResult = z.infer<
  typeof BulkCategorizationResultSchema
>;

export const DeduplicationOperationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    fieldIndex: z.number().int().min(0),
    category: CategoryEnum,
    tags: z.array(z.string().min(2).max(50)).min(1).max(5),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().optional(),
  }),
  z.object({
    action: z.literal("update"),
    fieldIndex: z.number().int().min(0),
    existingMemoryId: z.uuid(),
    newAnswer: z.string(),
    category: CategoryEnum,
    tags: z.array(z.string().min(2).max(50)).min(1).max(5),
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
export type DeduplicationOperation = z.infer<
  typeof DeduplicationOperationSchema
>;

export const DeduplicationResultSchema = z.object({
  operations: z.array(DeduplicationOperationSchema),
});
export type DeduplicationResult = z.infer<typeof DeduplicationResultSchema>;

export const ExtractedItemSchema = z.object({
  label: z.string(),
  question: z.string(),
  answer: z.string(),
  category: CategoryEnum,
  tags: z.array(TagSchema).min(1).max(5),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const ExtractedInfoSchema = z.object({
  items: z.array(ExtractedItemSchema),
});
export type ExtractedInfo = z.infer<typeof ExtractedInfoSchema>;

export const UsageStatusSchema = z.object({
  plan: z.enum(["free", "pro", "max"]),
  used: z.number(),
  limit: z.number().nullable(),
  remaining: z.number().nullable(),
  periodStart: z.string(),
  periodEnd: z.string(),
  resetAt: z.string(),
  breakdown: z.object({
    match: z.number(),
    categorize: z.number(),
    rephrase: z.number(),
    bulk_categorize: z.number(),
    deduplicate: z.number(),
    parse_document: z.number(),
  }),
});
