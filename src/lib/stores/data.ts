import { v7 as uuidv7 } from "uuid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { allowedCategories } from "@/lib/copies";
import { downloadCSV, parseCSV, stringifyToCSV } from "@/lib/csv";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { FillSession, FormMapping, MemoryEntry } from "@/types/memory";

type DataState = {
  entries: MemoryEntry[];

  formMappings: FormMapping[];
  fillSessions: FillSession[];
  currentSession: FillSession | null;

  loading: boolean;
  error: string | null;
};

type CreateMemoryEntry = Omit<MemoryEntry, "id" | "metadata">;
type UpdateMemoryEntry = Partial<Omit<MemoryEntry, "id" | "metadata">>;

type DataActions = {
  addEntry: (entry: CreateMemoryEntry) => MemoryEntry;
  updateEntry: (id: string, updates: UpdateMemoryEntry) => void;
  deleteEntry: (id: string) => void;
  getEntryById: (id: string) => MemoryEntry | undefined;
  searchEntries: (query: string) => MemoryEntry[];
  getEntriesByCategory: (category: string) => MemoryEntry[];
  getEntriesByTags: (tags: string[]) => MemoryEntry[];
  incrementUsageCount: (id: string) => void;
  getTopUsedTags: (topN: number) => Array<{ tag: string; count: number }>;
  exportToCSV: () => void;
  importFromCSV: (csvContent: string) => number;
  downloadCSVTemplate: () => void;

  addFormMapping: (mapping: FormMapping) => void;
  updateFormMapping: (url: string, updates: Partial<FormMapping>) => void;
  deleteFormMapping: (url: string) => void;
  getFormMappingByUrl: (url: string) => FormMapping | undefined;

  startSession: () => FillSession;
  updateSession: (id: string, updates: Partial<FillSession>) => void;
  completeSession: (id: string) => void;
  failSession: (id: string, error: string) => void;
  getSessionById: (id: string) => FillSession | undefined;
  getRecentSessions: (limit?: number) => FillSession[];
};

const logger = createLogger("store:data");

export const useDataStore = create<DataState & DataActions>()(
  persist(
    (set, get) => ({
      entries: [],

      formMappings: [],
      fillSessions: [],
      currentSession: null,

      loading: false,
      error: null,

      addEntry: (entry: CreateMemoryEntry) => {
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

          set({ loading: false });
          return newEntry;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to add entry";
          logger.error("Add entry error:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      updateEntry: (id: string, updates: UpdateMemoryEntry) => {
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

          set({ loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to update entry";
          logger.error("Update entry error:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      deleteEntry: (id: string) => {
        try {
          set({ loading: true, error: null });

          set((state) => ({
            entries: state.entries.filter((e) => e.id !== id),
          }));

          set({ loading: false });
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

      incrementUsageCount: (id: string) => {
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

      importFromCSV: (csvContent: string) => {
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

      addFormMapping: (mapping: FormMapping) => {
        try {
          set({ loading: true, error: null });

          const existingIndex = get().formMappings.findIndex(
            (m) => m.url === mapping.url && m.formId === mapping.formId,
          );

          if (existingIndex !== -1) {
            set((state) => ({
              formMappings: state.formMappings.map((m, i) =>
                i === existingIndex
                  ? { ...mapping, timestamp: new Date().toISOString() }
                  : m,
              ),
              loading: false,
            }));
          } else {
            set((state) => ({
              formMappings: [
                ...state.formMappings,
                { ...mapping, timestamp: new Date().toISOString() },
              ],
              loading: false,
            }));
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to add form mapping";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      updateFormMapping: (url: string, updates: Partial<FormMapping>) => {
        try {
          set({ loading: true, error: null });

          const mapping = get().formMappings.find((m) => m.url === url);

          if (!mapping) {
            throw new Error(`Form mapping for URL ${url} not found`);
          }

          const updatedMapping: FormMapping = {
            ...mapping,
            ...updates,
            timestamp: new Date().toISOString(),
          };

          set((state) => ({
            formMappings: state.formMappings.map((m) =>
              m.url === url ? updatedMapping : m,
            ),
            loading: false,
          }));
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to update form mapping";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      deleteFormMapping: (url: string) => {
        try {
          set({ loading: true, error: null });
          set((state) => ({
            formMappings: state.formMappings.filter((m) => m.url !== url),
            loading: false,
          }));
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to delete form mapping";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      getFormMappingByUrl: (url: string) => {
        return get().formMappings.find((m) => m.url === url);
      },

      startSession: () => {
        try {
          set({ loading: true, error: null });

          const newSession: FillSession = {
            id: uuidv7(),
            formMappings: [],
            status: "detecting",
            startedAt: new Date().toISOString(),
          };

          set((state) => ({
            fillSessions: [...state.fillSessions, newSession],
            currentSession: newSession,
            loading: false,
          }));

          return newSession;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to start session";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      updateSession: (id: string, updates: Partial<FillSession>) => {
        try {
          set({ loading: true, error: null });

          const session = get().fillSessions.find((s) => s.id === id);

          if (!session) {
            throw new Error(`Session with id ${id} not found`);
          }

          const updatedSession: FillSession = {
            ...session,
            ...updates,
          };

          set((state) => ({
            fillSessions: state.fillSessions.map((s) =>
              s.id === id ? updatedSession : s,
            ),
            currentSession:
              state.currentSession?.id === id
                ? updatedSession
                : state.currentSession,
            loading: false,
          }));
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to update session";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      completeSession: (id: string) => {
        try {
          set({ loading: true, error: null });

          const session = get().fillSessions.find((s) => s.id === id);

          if (!session) {
            throw new Error(`Session with id ${id} not found`);
          }

          const completedSession: FillSession = {
            ...session,
            status: "completed",
            completedAt: new Date().toISOString(),
          };

          set((state) => ({
            fillSessions: state.fillSessions.map((s) =>
              s.id === id ? completedSession : s,
            ),
            currentSession:
              state.currentSession?.id === id ? null : state.currentSession,
            loading: false,
          }));
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to complete session";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      failSession: (id: string, errorMsg: string) => {
        try {
          set({ loading: true, error: null });

          const session = get().fillSessions.find((s) => s.id === id);

          if (!session) {
            throw new Error(`Session with id ${id} not found`);
          }

          const failedSession: FillSession = {
            ...session,
            status: "failed",
            error: errorMsg,
            completedAt: new Date().toISOString(),
          };

          set((state) => ({
            fillSessions: state.fillSessions.map((s) =>
              s.id === id ? failedSession : s,
            ),
            currentSession:
              state.currentSession?.id === id ? null : state.currentSession,
            loading: false,
          }));
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to mark session as failed";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      getSessionById: (id: string) => {
        return get().fillSessions.find((s) => s.id === id);
      },

      getRecentSessions: (limit = 10) => {
        return get()
          .fillSessions.slice()
          .sort(
            (a, b) =>
              new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
          )
          .slice(0, limit);
      },
    }),
    {
      name: "data-storage",
      storage: createJSONStorage(() => ({
        getItem: async () => {
          try {
            const [formMappings, fillSessions, entries] = await Promise.all([
              storage.formMappings.getValue(),
              storage.fillSessions.getValue(),
              storage.memories.getValue(),
            ]);

            return JSON.stringify({
              state: {
                formMappings,
                fillSessions,
                entries,
                currentSession: null,
                loading: false,
                error: null,
              },
            });
          } catch (error) {
            logger.error("Failed to load form data:", error);
            return null;
          }
        },
        setItem: async (_name: string, value: string) => {
          try {
            const parsed = JSON.parse(value);

            if (!parsed || typeof parsed !== "object" || !("state" in parsed)) {
              logger.warn("Invalid form data structure, skipping save");
              return;
            }

            const { state } = parsed as {
              state: {
                formMappings: FormMapping[];
                fillSessions: FillSession[];
                entries: MemoryEntry[];
              };
            };

            if (!state) {
              logger.warn("No state in parsed form data, skipping save");
              return;
            }

            await Promise.all([
              storage.formMappings.setValue(state.formMappings),
              storage.fillSessions.setValue(state.fillSessions),
              storage.memories.setValue(state.entries),
            ]);
          } catch (error) {
            logger.error("Failed to save form data:", error);
          }
        },
        removeItem: async () => {
          await Promise.all([
            storage.formMappings.setValue([]),
            storage.fillSessions.setValue([]),
            storage.memories.setValue([]),
          ]);
        },
      })),
    },
  ),
);
