import { v7 as uuidv7 } from "uuid";
import { isAllowedCategory } from "@/lib/copies";
import { downloadCSV, parseCSV, stringifyToCSV } from "@/lib/csv";
import { createLogger } from "@/lib/logger";
import { getDatabase, type MemoryDocType } from "@/lib/rxdb";
import type { MemoryEntry } from "@/types/memory";

const logger = createLogger("storage:memories");

type CreateMemoryEntry = Omit<MemoryEntry, "id" | "metadata">;
type UpdateMemoryEntry = Partial<Omit<MemoryEntry, "id" | "metadata">>;

/**
 * Convert RxDB document to MemoryEntry format for API compatibility
 * Uses `any` to handle RxDB's DeepReadonly return type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMemoryEntry(doc: any): MemoryEntry {
  return {
    id: doc.id,
    syncId: doc.syncId,
    question: doc.question,
    answer: doc.answer,
    category: doc.category,
    tags: [...(doc.tags || [])], // Spread to convert DeepReadonly to mutable
    confidence: doc.confidence,
    embedding: doc.embedding ? [...doc.embedding] : undefined, // Spread to convert DeepReadonly
    metadata: {
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      source: doc.source,
      fieldPurpose: doc.fieldPurpose,
    },
  };
}

/**
 * Convert MemoryEntry to RxDB document format
 */
function toRxDBDoc(entry: CreateMemoryEntry, id?: string): MemoryDocType {
  return {
    id: id || uuidv7(),
    question: entry.question,
    answer: entry.answer,
    category: entry.category,
    tags: entry.tags || [],
    confidence: entry.confidence,
    embedding: entry.embedding,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "manual",
    _deleted: false,
  };
}

export const addEntry = async (
  entry: CreateMemoryEntry,
): Promise<MemoryEntry> => {
  try {
    const db = await getDatabase();
    const doc = toRxDBDoc(entry);

    await db.memories.insert(doc);

    return toMemoryEntry(doc);
  } catch (error) {
    logger.error("Failed to add entry:", error);
    throw error;
  }
};

export const addEntries = async (
  entries: CreateMemoryEntry[],
): Promise<MemoryEntry[]> => {
  try {
    const db = await getDatabase();
    const docs = entries.map((entry) => toRxDBDoc(entry));

    await db.memories.bulkInsert(docs);

    return docs.map(toMemoryEntry);
  } catch (error) {
    logger.error("Failed to add entries:", error);
    throw error;
  }
};

export const updateEntry = async (
  id: string,
  updates: UpdateMemoryEntry,
): Promise<MemoryEntry> => {
  try {
    const db = await getDatabase();
    const doc = await db.memories.findOne(id).exec();

    if (!doc) {
      throw new Error(`Entry with id ${id} not found`);
    }

    await doc.update({
      $set: {
        ...updates,
        updatedAt: new Date().toISOString(),
      },
    });

    const updated = doc.toJSON();
    return toMemoryEntry(updated);
  } catch (error) {
    logger.error("Failed to update entry:", error);
    throw error;
  }
};

export const deleteEntry = async (id: string): Promise<void> => {
  try {
    const db = await getDatabase();
    const doc = await db.memories.findOne(id).exec();

    if (doc) {
      await doc.remove();
    }
  } catch (error) {
    logger.error("Failed to delete entry:", error);
    throw error;
  }
};

export const getEntryById = async (
  id: string,
): Promise<MemoryEntry | undefined> => {
  try {
    const db = await getDatabase();
    const doc = await db.memories.findOne(id).exec();

    return doc ? toMemoryEntry(doc.toJSON()) : undefined;
  } catch (error) {
    logger.error("Failed to get entry by id:", error);
    throw error;
  }
};

/**
 * Get all memories (used for compatibility with existing code)
 */
export const getAllMemories = async (): Promise<MemoryEntry[]> => {
  try {
    const db = await getDatabase();
    const docs = await db.memories.find().exec();

    return docs.map((doc) => toMemoryEntry(doc.toJSON()));
  } catch (error) {
    logger.error("Failed to get all memories:", error);
    throw error;
  }
};

export const exportToCSV = async (): Promise<void> => {
  try {
    const entries = await getAllMemories();

    const headers: Array<
      | "question"
      | "answer"
      | "tags"
      | "category"
      | "confidence"
      | "createdAt"
      | "updatedAt"
    > = [
      "question",
      "answer",
      "category",
      "tags",
      "confidence",
      "createdAt",
      "updatedAt",
    ];

    const csvData = entries.map((entry) => ({
      question: entry.question || "",
      answer: entry.answer,
      category: entry.category,
      tags: entry.tags,
      confidence: entry.confidence,
      createdAt: entry.metadata.createdAt,
      updatedAt: entry.metadata.updatedAt,
    }));

    const csv = stringifyToCSV(csvData, headers);
    const filename = `superfill-memories-${new Date().toISOString().split("T")[0]}.csv`;

    downloadCSV(csv, filename);
  } catch (error) {
    logger.error("Failed to export CSV:", error);
    throw error;
  }
};

export const importFromCSV = async (csvContent: string): Promise<number> => {
  try {
    const rows = parseCSV<{
      question: string;
      answer: string;
      category: string;
      tags: string | string[];
      confidence: string;
      createdAt: string;
      updatedAt: string;
    }>(csvContent);

    if (rows.length === 0) {
      throw new Error("CSV file is empty or invalid");
    }

    const db = await getDatabase();

    const importedDocs: MemoryDocType[] = rows.map((row) => {
      const tags = Array.isArray(row.tags)
        ? row.tags
        : row.tags
            .split(";")
            .map((t) => t.trim())
            .filter(Boolean);
      const category = isAllowedCategory(row.category)
        ? row.category
        : "general";
      const confidence = Math.max(
        0,
        Math.min(1, Number.parseFloat(row.confidence) || 0.8),
      );
      const createdAt = row.createdAt || new Date().toISOString();
      const updatedAt = row.updatedAt || new Date().toISOString();

      return {
        id: uuidv7(),
        question: row.question || undefined,
        answer: row.answer,
        category,
        tags,
        confidence,
        createdAt,
        updatedAt,
        source: "import" as const,
        _deleted: false,
      };
    });

    await db.memories.bulkInsert(importedDocs);

    return importedDocs.length;
  } catch (error) {
    logger.error("Failed to import CSV:", error);
    throw error;
  }
};

export const downloadCSVTemplate = (): void => {
  const headers: Array<
    | "question"
    | "answer"
    | "category"
    | "tags"
    | "confidence"
    | "createdAt"
    | "updatedAt"
  > = [
    "question",
    "answer",
    "category",
    "tags",
    "confidence",
    "createdAt",
    "updatedAt",
  ];

  const csv = stringifyToCSV([], headers);
  const filename = "superfill-template.csv";

  downloadCSV(csv, filename);
};
