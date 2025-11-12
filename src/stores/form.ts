import { v7 as uuidv7 } from "uuid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createLogger } from "@/lib/logger";
import { store } from "@/lib/storage";
import type { FillSession, FormMapping } from "@/types/memory";

const logger = createLogger("store:form");

type FormState = {
  formMappings: FormMapping[];
  fillSessions: FillSession[];
  currentSession: FillSession | null;
  loading: boolean;
  error: string | null;
};

type FormActions = {
  addFormMapping: (mapping: FormMapping) => Promise<void>;
  updateFormMapping: (
    url: string,
    updates: Partial<FormMapping>,
  ) => Promise<void>;
  deleteFormMapping: (url: string) => Promise<void>;
  getFormMappingByUrl: (url: string) => FormMapping | undefined;
  clearFormMappings: () => Promise<void>;

  startSession: () => Promise<FillSession>;
  updateSession: (id: string, updates: Partial<FillSession>) => Promise<void>;
  completeSession: (id: string) => Promise<void>;
  failSession: (id: string, error: string) => Promise<void>;
  getSessionById: (id: string) => FillSession | undefined;
  getRecentSessions: (limit?: number) => FillSession[];
  clearSessions: () => Promise<void>;
};

export const useFormStore = create<FormState & FormActions>()(
  persist(
    (set, get) => ({
      formMappings: [],
      fillSessions: [],
      currentSession: null,
      loading: false,
      error: null,

      addFormMapping: async (mapping: FormMapping) => {
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

      updateFormMapping: async (url: string, updates: Partial<FormMapping>) => {
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

      deleteFormMapping: async (url: string) => {
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

      clearFormMappings: async () => {
        try {
          set({ loading: true, error: null });
          set({ formMappings: [], loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to clear form mappings";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      startSession: async () => {
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

      updateSession: async (id: string, updates: Partial<FillSession>) => {
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

      completeSession: async (id: string) => {
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

      failSession: async (id: string, errorMsg: string) => {
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

      clearSessions: async () => {
        try {
          set({ loading: true, error: null });
          set({ fillSessions: [], currentSession: null, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to clear sessions";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },
    }),
    {
      name: "form-storage",
      storage: createJSONStorage(() => ({
        getItem: async () => {
          try {
            const [formMappings, fillSessions] = await Promise.all([
              store.formMappings.getValue(),
              store.fillSessions.getValue(),
            ]);

            return JSON.stringify({
              state: {
                formMappings,
                fillSessions,
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

            const { state } = parsed as { state: FormState };

            if (!state) {
              logger.warn("No state in parsed form data, skipping save");
              return;
            }

            await Promise.all([
              store.formMappings.setValue(state.formMappings),
              store.fillSessions.setValue(state.fillSessions),
            ]);
          } catch (error) {
            logger.error("Failed to save form data:", error);
          }
        },
        removeItem: async () => {
          await Promise.all([
            store.formMappings.setValue([]),
            store.fillSessions.setValue([]),
          ]);
        },
      })),
    },
  ),
);
