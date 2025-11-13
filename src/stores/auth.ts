import { createLogger } from "@/lib/logger";
import { autoSyncManager } from "@/lib/sync/auto-sync-manager";
import { getSyncService } from "@/lib/sync/sync-service";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const logger = createLogger("store:auth");

type AuthStoreState = {
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
};

type AuthActions = {
  setAuthToken: (token: string) => Promise<void>;
  getAuthToken: () => Promise<string | null>;
  clearAuthToken: () => Promise<void>;
  checkAuthStatus: () => Promise<boolean>;
};

const AUTH_STORAGE_KEY = "superfill:auth:token";

export const useAuthStore = create<AuthStoreState & AuthActions>()(
  persist(
    (set, get) => ({
      token: null,
      isAuthenticated: false,
      loading: false,
      error: null,

      setAuthToken: async (token: string) => {
        try {
          set({ loading: true, error: null });

          set({
            token,
            isAuthenticated: true,
            loading: false,
          });

          logger.info("Auth token stored successfully");

          try {
            const syncService = getSyncService();
            await syncService.setAuthToken(token);
            logger.info("Sync service authenticated");

            await autoSyncManager.triggerSync("full", { silent: false });
          } catch (error) {
            logger.error("Failed to initialize sync service", { error });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to store auth token";
          logger.error("Failed to store auth token", { error });
          set({ loading: false, error: errorMessage, isAuthenticated: false });
          throw error;
        }
      },

      getAuthToken: async () => {
        return get().token;
      },

      clearAuthToken: async () => {
        try {
          set({
            token: null,
            isAuthenticated: false,
            loading: false,
            error: null,
          });

          logger.info("Auth token cleared successfully");

          const syncService = getSyncService();
          syncService.clearAuth();
          logger.info("Sync service auth cleared");
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to clear auth token";
          logger.error("Failed to clear auth token", { error });
          set({ error: errorMessage });
          throw error;
        }
      },

      checkAuthStatus: async () => {
        try {
          const { token } = get();
          const isAuthenticated = !!token;

          set({ isAuthenticated });

          return isAuthenticated;
        } catch (error) {
          logger.error("Failed to check auth status", { error });
          set({ isAuthenticated: false });
          return false;
        }
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => ({
        getItem: async (name: string) => {
          try {
            const value = await browser.storage.local.get(name);
            return value[name] || null;
          } catch (error) {
            logger.error("Failed to get auth state from storage", { error });
            return null;
          }
        },
        setItem: async (name: string, value: string) => {
          try {
            await browser.storage.local.set({ [name]: value });
          } catch (error) {
            logger.error("Failed to set auth state in storage", { error });
          }
        },
        removeItem: async (name: string) => {
          try {
            await browser.storage.local.remove(name);
          } catch (error) {
            logger.error("Failed to remove auth state from storage", { error });
          }
        },
      })),
    },
  ),
);
