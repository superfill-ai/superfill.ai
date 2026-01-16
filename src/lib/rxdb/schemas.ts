import type { RxCollection, RxDocument, RxJsonSchema } from "rxdb";
import { allowedCategories } from "@/lib/copies";
import type { AllowedCategory } from "@/types/memory";

/**
 * RxDB document type for memories
 */
export interface MemoryDocType {
  id: string;
  syncId?: string;
  question?: string;
  answer: string;
  category: AllowedCategory;
  tags: string[];
  confidence: number;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
  source: "manual" | "import" | "autofill";
  fieldPurpose?: string;
  // RxDB sync fields
  _deleted: boolean;
}

export type MemoryDocument = RxDocument<MemoryDocType>;
export type MemoryCollection = RxCollection<MemoryDocType>;

/**
 * RxDB JSON schema for memories collection
 */
export const memorySchema: RxJsonSchema<MemoryDocType> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: {
      type: "string",
      maxLength: 36,
    },
    syncId: {
      type: "string",
      maxLength: 36,
    },
    question: {
      type: "string",
    },
    answer: {
      type: "string",
    },
    category: {
      type: "string",
      enum: allowedCategories as unknown as string[],
    },
    tags: {
      type: "array",
      items: {
        type: "string",
      },
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    embedding: {
      type: "array",
      items: {
        type: "number",
      },
    },
    createdAt: {
      type: "string",
      format: "date-time",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
    },
    source: {
      type: "string",
      enum: ["manual", "import", "autofill"],
    },
    fieldPurpose: {
      type: "string",
    },
    _deleted: {
      type: "boolean",
    },
  },
  required: [
    "id",
    "answer",
    "category",
    "tags",
    "confidence",
    "createdAt",
    "updatedAt",
    "source",
    "_deleted",
  ],
  indexes: ["category", "updatedAt"],
};

export interface DatabaseCollections {
  memories: MemoryCollection;
}
