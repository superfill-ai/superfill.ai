import { v7 as uuidv7 } from "uuid";
import { create } from "zustand";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { FillSession } from "@/types/memory";

type SessionsState = {
  fillSessions: FillSession[];
  currentSession: FillSession | null;
  loading: boolean;
  error: string | null;
};

type SessionsActions = {
  startSession: () => Promise<FillSession>;
  updateSession: (id: string, updates: Partial<FillSession>) => Promise<void>;
  completeSession: (id: string) => Promise<void>;
  failSession: (id: string, error: string) => Promise<void>;
  getSessionById: (id: string) => FillSession | undefined;
  getRecentSessions: (limit?: number) => FillSession[];
};

const logger = createLogger("store:sessions");

let unwatchFillSessions: (() => void) | undefined;

export const useSessionsStore = create<SessionsState & SessionsActions>()(
  (set, get) => {
    storage.fillSessions.getValue().then((fillSessions) => {
      set({ fillSessions });
    });

    if (!unwatchFillSessions) {
      unwatchFillSessions = storage.fillSessions.watch((newSessions) => {
        if (newSessions !== null) {
          set({ fillSessions: newSessions });
        }
      });
    }

    return {
      fillSessions: [],
      currentSession: null,
      loading: false,
      error: null,

      startSession: async () => {
        try {
          set({ loading: true, error: null });

          const newSession: FillSession = {
            id: uuidv7(),
            formMappings: [],
            status: "detecting",
            startedAt: new Date().toISOString(),
          };

          const currentSessions = await storage.fillSessions.getValue();
          const updatedSessions = [...currentSessions, newSession];

          await storage.fillSessions.setValue(updatedSessions);
          set({
            fillSessions: updatedSessions,
            currentSession: newSession,
            loading: false,
          });

          return newSession;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to start session";
          logger.error("Failed to start session:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      updateSession: async (id: string, updates: Partial<FillSession>) => {
        try {
          set({ loading: true, error: null });

          const currentSessions = await storage.fillSessions.getValue();
          const session = currentSessions.find((s) => s.id === id);

          if (!session) {
            throw new Error(`Session with id ${id} not found`);
          }

          const updatedSession: FillSession = {
            ...session,
            ...updates,
          };

          const updatedSessions = currentSessions.map((s) =>
            s.id === id ? updatedSession : s,
          );

          await storage.fillSessions.setValue(updatedSessions);
          set({
            fillSessions: updatedSessions,
            currentSession:
              get().currentSession?.id === id
                ? updatedSession
                : get().currentSession,
            loading: false,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to update session";
          logger.error("Failed to update session:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      completeSession: async (id: string) => {
        try {
          set({ loading: true, error: null });

          const currentSessions = await storage.fillSessions.getValue();
          const session = currentSessions.find((s) => s.id === id);

          if (!session) {
            throw new Error(`Session with id ${id} not found`);
          }

          const completedSession: FillSession = {
            ...session,
            status: "completed",
            completedAt: new Date().toISOString(),
          };

          const updatedSessions = currentSessions.map((s) =>
            s.id === id ? completedSession : s,
          );

          await storage.fillSessions.setValue(updatedSessions);
          set({
            fillSessions: updatedSessions,
            currentSession:
              get().currentSession?.id === id ? null : get().currentSession,
            loading: false,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to complete session";
          logger.error("Failed to complete session:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      failSession: async (id: string, errorMsg: string) => {
        try {
          set({ loading: true, error: null });

          const currentSessions = await storage.fillSessions.getValue();
          const session = currentSessions.find((s) => s.id === id);

          if (!session) {
            throw new Error(`Session with id ${id} not found`);
          }

          const failedSession: FillSession = {
            ...session,
            status: "failed",
            error: errorMsg,
            completedAt: new Date().toISOString(),
          };

          const updatedSessions = currentSessions.map((s) =>
            s.id === id ? failedSession : s,
          );

          await storage.fillSessions.setValue(updatedSessions);
          set({
            fillSessions: updatedSessions,
            currentSession:
              get().currentSession?.id === id ? null : get().currentSession,
            loading: false,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to mark session as failed";
          logger.error("Failed to fail session:", error);
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
    };
  },
);

export const cleanupSessionsWatchers = () => {
  unwatchFillSessions?.();
  unwatchFillSessions = undefined;
};

if (import.meta.hot) {
  import.meta.hot.dispose(cleanupSessionsWatchers);
}
