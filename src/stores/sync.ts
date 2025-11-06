import { createLogger } from "@/lib/logger";
import { store } from "@/lib/storage";
import type { SyncState } from "@/types/memory";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const logger = createLogger("store:sync");

type SyncStoreState = {
  syncState: SyncState;
  loading: boolean;
  error: string | null;
};

type SyncActions = {
  updateSyncState: (updates: Partial<SyncState>) => Promise<void>;
  setConflictResolution: (
    resolution: SyncState["conflictResolution"],
  ) => Promise<void>;

  markSynced: () => Promise<void>;
  markSyncPending: () => Promise<void>;
  markSyncError: (error?: string) => Promise<void>;

  initiateSync: () => Promise<void>;
  pullFromRemote: () => Promise<void>;
  pushToRemote: () => Promise<void>;
  resolveConflicts: () => Promise<void>;
};

export const useSyncStore = create<SyncStoreState & SyncActions>()(
  persist(
    (set, get) => ({
      syncState: {
        lastSync: new Date().toISOString(),
        conflictResolution: "newest",
        status: "pending",
      },
      loading: false,
      error: null,

      updateSyncState: async (updates: Partial<SyncState>) => {
        try {
          set({ loading: true, error: null });

          const updatedSyncState: SyncState = {
            ...get().syncState,
            ...updates,
          };

          set({ syncState: updatedSyncState });

          await store.syncState.setValue(updatedSyncState);

          set({ loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to update sync state";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setConflictResolution: async (
        resolution: SyncState["conflictResolution"],
      ) => {
        try {
          set({ loading: true, error: null });

          const updatedSyncState: SyncState = {
            ...get().syncState,
            conflictResolution: resolution,
          };

          set({ syncState: updatedSyncState });

          await store.syncState.setValue(updatedSyncState);

          set({ loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to set conflict resolution";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      markSynced: async () => {
        try {
          set({ loading: true, error: null });

          const updatedSyncState: SyncState = {
            ...get().syncState,
            status: "synced",
            lastSync: new Date().toISOString(),
          };

          set({ syncState: updatedSyncState });

          await store.syncState.setValue(updatedSyncState);

          set({ loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to mark synced";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      markSyncPending: async () => {
        try {
          set({ loading: true, error: null });

          const updatedSyncState: SyncState = {
            ...get().syncState,
            status: "pending",
          };

          set({ syncState: updatedSyncState });

          await store.syncState.setValue(updatedSyncState);

          set({ loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to mark sync pending";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      markSyncError: async (errorMsg?: string) => {
        try {
          set({ loading: true, error: errorMsg || null });

          const updatedSyncState: SyncState = {
            ...get().syncState,
            status: "error",
          };

          set({ syncState: updatedSyncState });

          await store.syncState.setValue(updatedSyncState);

          set({ loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to mark sync error";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      initiateSync: async () => {
        throw new Error("Sync operations not implemented - Phase 2 feature");
      },

      pullFromRemote: async () => {
        throw new Error("Pull from remote not implemented - Phase 2 feature");
      },

      pushToRemote: async () => {
        throw new Error("Push to remote not implemented - Phase 2 feature");
      },

      resolveConflicts: async () => {
        throw new Error(
          "Conflict resolution not implemented - Phase 2 feature",
        );
      },
    }),
    {
      name: "sync-storage",
      storage: createJSONStorage(() => ({
        getItem: async () => {
          try {
            const value = await store.syncState.getValue();
            if (!value) return null;
            return JSON.stringify({ state: { syncState: value } });
          } catch (error) {
            logger.error("Failed to get sync state from storage", { error });
            return null;
          }
        },
        setItem: async (_name: string, value: string) => {
          try {
            const parsed = JSON.parse(value);
            const syncState = parsed.state.syncState as SyncState;

            if (syncState) {
              await store.syncState.setValue(syncState);
            }
          } catch (error) {
            logger.error("Failed to set sync state in storage", { error });
          }
        },
        removeItem: async () => {
          await store.syncState.setValue({
            lastSync: new Date().toISOString(),
            conflictResolution: "newest",
            status: "pending",
          });
        },
      })),
    },
  ),
);
