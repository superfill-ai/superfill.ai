import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createLogger } from "@/lib/logger";
import { store } from "@/lib/storage";
import type { SyncState } from "@/types/memory";

const logger = createLogger("store:sync");

type SyncStoreState = {
  syncState: SyncState;
  loading: boolean;
  error: string | null;
};

type SyncActions = {
  updateSyncState: (updates: Partial<SyncState>) => Promise<void>;
  setSyncUrl: (url: string) => Promise<void>;
  setSyncToken: (token: string) => Promise<void>;
  setConflictResolution: (
    resolution: SyncState["conflictResolution"],
  ) => Promise<void>;
  clearSyncCredentials: () => Promise<void>;

  markSynced: () => Promise<void>;
  markSyncPending: () => Promise<void>;
  markSyncError: (error?: string) => Promise<void>;

  // Phase 2: Sync Operations (stub implementations)
  initiateSync: () => Promise<void>;
  pullFromRemote: () => Promise<void>;
  pushToRemote: () => Promise<void>;
  resolveConflicts: () => Promise<void>;
};

export const useSyncStore = create<SyncStoreState & SyncActions>()(
  persist(
    (set, get) => ({
      syncState: {
        syncUrl: "",
        syncToken: "",
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

          set({ syncState: updatedSyncState, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to update sync state";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setSyncUrl: async (url: string) => {
        try {
          set({ loading: true, error: null });

          const updatedSyncState: SyncState = {
            ...get().syncState,
            syncUrl: url,
          };

          set({ syncState: updatedSyncState, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set sync URL";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setSyncToken: async (token: string) => {
        try {
          set({ loading: true, error: null });

          const updatedSyncState: SyncState = {
            ...get().syncState,
            syncToken: token,
          };

          set({ syncState: updatedSyncState, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set sync token";
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

          set({ syncState: updatedSyncState, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to set conflict resolution";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      clearSyncCredentials: async () => {
        try {
          set({ loading: true, error: null });

          const updatedSyncState: SyncState = {
            ...get().syncState,
            syncUrl: "",
            syncToken: "",
            status: "pending",
          };

          set({ syncState: updatedSyncState, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to clear sync credentials";
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

          set({ syncState: updatedSyncState, loading: false });
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

          set({ syncState: updatedSyncState, loading: false });
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

          set({ syncState: updatedSyncState, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to mark sync error";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      // Phase 2: Sync Operations (stub implementations)
      initiateSync: async () => {
        // TODO: Implement in Phase 2
        // This will orchestrate the full sync process:
        // 1. Pull changes from remote
        // 2. Resolve conflicts if any
        // 3. Push local changes to remote
        // 4. Update lastSync timestamp
        throw new Error("Sync operations not implemented - Phase 2 feature");
      },

      pullFromRemote: async () => {
        // TODO: Implement in Phase 2
        // This will:
        // 1. Fetch latest data from sync URL
        // 2. Authenticate with sync token
        // 3. Update local store with remote data
        // 4. Handle merge conflicts based on conflictResolution strategy
        throw new Error("Pull from remote not implemented - Phase 2 feature");
      },

      pushToRemote: async () => {
        // TODO: Implement in Phase 2
        // This will:
        // 1. Gather local changes since lastSync
        // 2. Authenticate with sync token
        // 3. Push changes to sync URL
        // 4. Update sync status
        throw new Error("Push to remote not implemented - Phase 2 feature");
      },

      resolveConflicts: async () => {
        // TODO: Implement in Phase 2
        // This will handle conflict resolution based on strategy:
        // - 'local': Keep local version
        // - 'remote': Keep remote version
        // - 'newest': Keep version with latest updatedAt timestamp
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
            const syncState = await store.syncState.getValue();

            return JSON.stringify({
              state: {
                syncState,
                loading: false,
                error: null,
              },
            });
          } catch (error) {
            logger.error("Failed to load sync state:", error);
            return null;
          }
        },
        setItem: async (_name: string, value: string) => {
          try {
            const parsed = JSON.parse(value);

            if (!parsed || typeof parsed !== "object" || !("state" in parsed)) {
              logger.warn("Invalid sync state structure, skipping save");
              return;
            }

            const { state } = parsed as { state: SyncStoreState };

            if (!state || !state.syncState) {
              logger.warn("No state in parsed sync data, skipping save");
              return;
            }

            await store.syncState.setValue(state.syncState);
          } catch (error) {
            logger.error("Failed to save sync state:", error);
          }
        },
        removeItem: async () => {
          await store.syncState.setValue({
            syncUrl: "",
            syncToken: "",
            lastSync: new Date().toISOString(),
            conflictResolution: "newest",
            status: "pending",
          });
        },
      })),
    },
  ),
);
