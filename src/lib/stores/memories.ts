import { v7 as uuidv7 } from "uuid";
import { create } from "zustand";
import { allowedCategories } from "@/lib/copies";
import { downloadCSV, parseCSV, stringifyToCSV } from "@/lib/csv";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { MemoryEntry } from "@/types/memory";

type MemoriesState = {
  entries: MemoryEntry[];
  loading: boolean;
  error: string | null;
};

type CreateMemoryEntry = Omit<MemoryEntry, "id" | "metadata">;
type UpdateMemoryEntry = Partial<Omit<MemoryEntry, "id" | "metadata">>;

type MemoriesActions = {
  addEntry: (entry: CreateMemoryEntry) => Promise<MemoryEntry>;
  updateEntry: (id: string, updates: UpdateMemoryEntry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  getEntryById: (id: string) => MemoryEntry | undefined;
  searchEntries: (query: string) => MemoryEntry[];
  getEntriesByCategory: (category: string) => MemoryEntry[];
  getEntriesByTags: (tags: string[]) => MemoryEntry[];
  incrementUsageCount: (id: string) => Promise<void>;
  getTopUsedTags: (topN: number) => Array<{ tag: string; count: number }>;
  exportToCSV: () => void;
  importFromCSV: (csvContent: string) => Promise<number>;
  downloadCSVTemplate: () => void;
};

const logger = createLogger("store:memories");

let unwatchMemories: (() => void) | undefined;

export const useMemoriesStore = create<MemoriesState & MemoriesActions>()(
  (set, get) => {
    // Initialize from storage
    storage.memories.getValue().then((entries) => {
      set({ entries });
    });

    // Watch for external changes (from other tabs/contexts)
    if (!unwatchMemories) {
      unwatchMemories = storage.memories.watch((newMemories) => {
        if (newMemories !== null) {
          set({ entries: newMemories });
        }
      });
    }

    return {
      entries: [],
      loading: false,
      error: null,

      addEntry: async (entry: CreateMemoryEntry) => {
        try {
          set({ loading: true, error: null });

          const newEntry: MemoryEntry = {
            ...entry,
            id: uuidv7(),
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              source: "manual",
              usageCount: 0,
            },
          };

          const currentEntries = await storage.memories.getValue();
          const updatedEntries = [...currentEntries, newEntry];

          await storage.memories.setValue(updatedEntries);
          set({ entries: updatedEntries, loading: false });

          return newEntry;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to add entry";
          logger.error("Add entry error:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      updateEntry: async (id: string, updates: UpdateMemoryEntry) => {
        try {
          set({ loading: true, error: null });

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
          set({ entries: updatedEntries, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to update entry";
          logger.error("Update entry error:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      deleteEntry: async (id: string) => {
        try {
          set({ loading: true, error: null });

          const currentEntries = await storage.memories.getValue();
          const updatedEntries = currentEntries.filter((e) => e.id !== id);

          await storage.memories.setValue(updatedEntries);
          set({ entries: updatedEntries, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to delete entry";
          logger.error("Delete entry error:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      getEntryById: (id: string) => {
        return get().entries.find((e) => e.id === id);
      },

      searchEntries: (query: string) => {
        const normalizedQuery = query.toLowerCase().trim();
        return get().entries.filter((entry) => {
          return (
            entry.answer.toLowerCase().includes(normalizedQuery) ||
            entry.question?.toLowerCase().includes(normalizedQuery) ||
            entry.category.toLowerCase().includes(normalizedQuery) ||
            entry.tags.some((tag) =>
              tag.toLowerCase().includes(normalizedQuery),
            )
          );
        });
      },

      getEntriesByCategory: (category: string) => {
        return get().entries.filter((entry) => entry.category === category);
      },

      getEntriesByTags: (tags: string[]) => {
        return get().entries.filter((entry) =>
          tags.some((tag) => entry.tags.includes(tag)),
        );
      },

      incrementUsageCount: async (id: string) => {
        try {
          const currentEntries = await storage.memories.getValue();
          const entry = currentEntries.find((e) => e.id === id);

          if (!entry) {
            throw new Error(`Entry with id ${id} not found`);
          }

          const updatedEntry: MemoryEntry = {
            ...entry,
            metadata: {
              ...entry.metadata,
              usageCount: entry.metadata.usageCount + 1,
              lastUsed: new Date().toISOString(),
            },
          };

          const updatedEntries = currentEntries.map((e) =>
            e.id === id ? updatedEntry : e,
          );

          await storage.memories.setValue(updatedEntries);
          set({ entries: updatedEntries });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to increment usage count";
          set({ error: errorMessage });
          throw error;
        }
      },

      getTopUsedTags: (topN: number): Array<{ tag: string; count: number }> => {
        const tagCountMap: Record<string, number> = {};

        get().entries.forEach((entry) => {
          entry.tags.forEach((tag) => {
            tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
          });
        });

        const sortedTags = Object.entries(tagCountMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([tag, count]) => ({ tag, count }));

        return sortedTags;
      },

      exportToCSV: () => {
        try {
          const entries = get().entries;
          const headers: Array<
            | "question"
            | "answer"
            | "tags"
            | "category"
            | "confidence"
            | "usageCount"
            | "lastUsed"
            | "createdAt"
            | "updatedAt"
          > = [
            "question",
            "answer",
            "category",
            "tags",
            "confidence",
            "usageCount",
            "lastUsed",
            "createdAt",
            "updatedAt",
          ];

          const csvData = entries.map((entry) => ({
            question: entry.question || "",
            answer: entry.answer,
            category: entry.category,
            tags: entry.tags,
            confidence: entry.confidence,
            usageCount: entry.metadata.usageCount,
            lastUsed: entry.metadata.lastUsed || "",
            createdAt: entry.metadata.createdAt,
            updatedAt: entry.metadata.updatedAt,
          }));

          const csv = stringifyToCSV(csvData, headers);
          const filename = `superfill-memories-${new Date().toISOString().split("T")[0]}.csv`;

          downloadCSV(csv, filename);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to export CSV";
          set({ error: errorMessage });
          throw error;
        }
      },

      importFromCSV: async (csvContent: string) => {
        try {
          set({ loading: true, error: null });

          const rows = parseCSV<{
            question: string;
            answer: string;
            category: string;
            tags: string | string[];
            confidence: string;
            usageCount: string;
            lastUsed: string;
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
            const usageCount = Number.parseInt(row.usageCount, 10) || 0;
            const createdAt = row.createdAt || new Date().toISOString();
            const updatedAt = row.updatedAt || new Date().toISOString();
            const lastUsed = row.lastUsed || undefined;

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
                usageCount,
                lastUsed,
              },
            };
          });

          const currentEntries = await storage.memories.getValue();
          const updatedEntries = [...currentEntries, ...importedEntries];

          await storage.memories.setValue(updatedEntries);
          set({ entries: updatedEntries, loading: false });

          return importedEntries.length;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to import CSV";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      downloadCSVTemplate: () => {
        const headers: Array<
          | "question"
          | "answer"
          | "category"
          | "tags"
          | "confidence"
          | "usageCount"
          | "lastUsed"
          | "createdAt"
          | "updatedAt"
        > = [
          "question",
          "answer",
          "category",
          "tags",
          "confidence",
          "usageCount",
          "lastUsed",
          "createdAt",
          "updatedAt",
        ];

        const csv = stringifyToCSV([], headers);
        const filename = "superfill-template.csv";

        downloadCSV(csv, filename);
      },
    };
  },
);

export const cleanupMemoriesWatchers = () => {
  unwatchMemories?.();
  unwatchMemories = undefined;
};

if (import.meta.hot) {
  import.meta.hot.dispose(cleanupMemoriesWatchers);
}
