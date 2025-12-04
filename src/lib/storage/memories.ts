import { v7 as uuidv7 } from "uuid";
import { allowedCategories } from "@/lib/copies";
import { downloadCSV, parseCSV, stringifyToCSV } from "@/lib/csv";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { MemoryEntry } from "@/types/memory";

const logger = createLogger("storage:memories");

type CreateMemoryEntry = Omit<MemoryEntry, "id" | "metadata">;
type UpdateMemoryEntry = Partial<Omit<MemoryEntry, "id" | "metadata">>;

export const addEntry = async (
  entry: CreateMemoryEntry,
): Promise<MemoryEntry> => {
  try {
    const newEntry: MemoryEntry = {
      ...entry,
      id: uuidv7(),
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: "manual",
      },
    };

    const currentEntries = await storage.memories.getValue();
    const updatedEntries = [...currentEntries, newEntry];

    await storage.memories.setValue(updatedEntries);

    return newEntry;
  } catch (error) {
    logger.error("Failed to add entry:", error);
    throw error;
  }
};

export const addEntries = async (
  entries: CreateMemoryEntry[],
): Promise<MemoryEntry[]> => {
  try {
    const newEntries: MemoryEntry[] = entries.map((entry) => ({
      ...entry,
      id: uuidv7(),
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: "manual",
      },
    }));

    const currentEntries = await storage.memories.getValue();
    const updatedEntries = [...currentEntries, ...newEntries];

    await storage.memories.setValue(updatedEntries);

    return newEntries;
  } catch (error) {
    logger.error("Failed to add entries:", error);
    throw error;
  }
};

export const updateEntry = async (
  id: string,
  updates: UpdateMemoryEntry,
): Promise<void> => {
  try {
    const currentEntries = await storage.memories.getValue();
    const entry = currentEntries.find((e) => e.id === id);

    if (!entry) {
      throw new Error(`Entry with id ${id} not found`);
    }

    const updatedEntry: MemoryEntry = {
      ...entry,
      ...updates,
      metadata: {
        ...entry.metadata,
        updatedAt: new Date().toISOString(),
      },
    };

    const updatedEntries = currentEntries.map((e) =>
      e.id === id ? updatedEntry : e,
    );

    await storage.memories.setValue(updatedEntries);
  } catch (error) {
    logger.error("Failed to update entry:", error);
    throw error;
  }
};

export const deleteEntry = async (id: string): Promise<void> => {
  try {
    const currentEntries = await storage.memories.getValue();
    const updatedEntries = currentEntries.filter((e) => e.id !== id);

    await storage.memories.setValue(updatedEntries);
  } catch (error) {
    logger.error("Failed to delete entry:", error);
    throw error;
  }
};

export const getEntryById = async (
  id: string,
): Promise<MemoryEntry | undefined> => {
  try {
    const currentEntries = await storage.memories.getValue();
    return currentEntries.find((e) => e.id === id);
  } catch (error) {
    logger.error("Failed to get entry by id:", error);
    throw error;
  }
};

export const exportToCSV = async (): Promise<void> => {
  try {
    const entries = await storage.memories.getValue();

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

    const importedEntries: MemoryEntry[] = rows.map((row) => {
      const tags = Array.isArray(row.tags)
        ? row.tags
        : row.tags
            .split(";")
            .map((t) => t.trim())
            .filter(Boolean);
      const category = allowedCategories.includes(row.category)
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
        metadata: {
          createdAt,
          updatedAt,
          source: "import" as const,
        },
      };
    });

    const currentEntries = await storage.memories.getValue();
    const updatedEntries = [...currentEntries, ...importedEntries];

    await storage.memories.setValue(updatedEntries);

    return importedEntries.length;
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
