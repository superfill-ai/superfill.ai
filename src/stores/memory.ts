import { v7 as uuidv7 } from "uuid";
import { create } from "zustand";
import { allowedCategories } from "@/lib/copies";
import { downloadCSV, parseCSV, stringifyToCSV } from "@/lib/csv";
import { store } from "@/lib/storage";
import type { MemoryEntry } from "@/types/memory";

type MemoryState = {
  entries: MemoryEntry[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
};

type CreateMemoryEntry = Omit<MemoryEntry, "id" | "metadata">;
type UpdateMemoryEntry = Partial<Omit<MemoryEntry, "id" | "metadata">>;

type MemoryActions = {
  initialize: () => Promise<void>;
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

export const useMemoryStore = create<MemoryState & MemoryActions>()(
  (set, get) => ({
    entries: [],
    loading: false,
    error: null,
    initialized: false,

    initialize: async () => {
      if (get().initialized || get().loading) return;

      try {
        set({ loading: true, error: null });
        const entries = await store.memories.getValue();
        set({ entries, initialized: true, loading: false });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to initialize";
        set({ error: errorMessage, loading: false, initialized: false });
        throw error;
      }
    },

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

        set((state) => ({
          entries: [...state.entries, newEntry],
        }));

        await store.memories.setValue([...get().entries]);

        set({ loading: false });

        import("@/lib/sync/auto-sync-manager").then(({ autoSyncManager }) => {
          autoSyncManager.triggerDebouncedPush();
        });

        return newEntry;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to add entry";
        set({ loading: false, error: errorMessage });
        throw error;
      }
    },

    updateEntry: async (id: string, updates: UpdateMemoryEntry) => {
      try {
        set({ loading: true, error: null });

        const entry = get().entries.find((e) => e.id === id);
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

        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? updatedEntry : e)),
        }));

        await store.memories.setValue(get().entries);

        set({ loading: false });

        import("@/lib/sync/auto-sync-manager").then(({ autoSyncManager }) => {
          autoSyncManager.triggerDebouncedPush();
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to update entry";
        set({ loading: false, error: errorMessage });
        throw error;
      }
    },

    deleteEntry: async (id: string) => {
      try {
        set({ loading: true, error: null });

        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        }));

        await store.memories.setValue(get().entries);

        set({ loading: false });

        import("@/lib/sync/auto-sync-manager").then(({ autoSyncManager }) => {
          autoSyncManager.triggerDebouncedPush();
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to delete entry";
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
          entry.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
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
        const entry = get().entries.find((e) => e.id === id);
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

        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? updatedEntry : e)),
        }));

        await store.memories.setValue(get().entries);
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

        set((state) => ({
          entries: [...state.entries, ...importedEntries],
        }));

        await store.memories.setValue(get().entries);

        set({ loading: false });
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
  }),
);
