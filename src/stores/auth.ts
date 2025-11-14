import { getAuthService } from "@/lib/auth/auth-service";
import { createLogger } from "@/lib/logger";
import { autoSyncManager } from "@/lib/sync/auto-sync-manager";
import { getSyncService } from "@/lib/sync/sync-service";
import type { Provider, Session } from "@supabase/supabase-js";
import { create } from "zustand";

const logger = createLogger("store:auth");

type AuthStoreState = {
  session: Session | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  signingIn: boolean;
  selectedProvider: Provider | null;
};

type AuthActions = {
  signIn: (provider: Provider) => Promise<void>;
  signOut: () => Promise<void>;
  checkAuthStatus: () => Promise<boolean>;
  loadSession: () => Promise<void>;
};

export const useAuthStore = create<AuthStoreState & AuthActions>(
  (set, get) => ({
    session: null,
    isAuthenticated: false,
    loading: false,
    error: null,
    signingIn: false,
    selectedProvider: null,

    signIn: async (provider: Provider) => {
      try {
        set({ signingIn: true, selectedProvider: provider, error: null });

        const authService = getAuthService();
        await authService.initiateOAuth(provider);

        logger.info(`OAuth flow initiated for ${provider}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to sign in";
        logger.error("Failed to sign in", { error });
        set({ signingIn: false, error: errorMessage, selectedProvider: null });
        throw error;
      }
    },

    signOut: async () => {
      try {
        set({ loading: true, error: null });

        const authService = getAuthService();
        await authService.clearSession();

        set({
          session: null,
          isAuthenticated: false,
          loading: false,
          selectedProvider: null,
        });

        logger.info("Signed out successfully");

        const syncService = getSyncService();
        syncService.clearAuth();
        logger.info("Sync service auth cleared");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to sign out";
        logger.error("Failed to sign out", { error });
        set({ error: errorMessage, loading: false });
        throw error;
      }
    },

    checkAuthStatus: async () => {
      try {
        const authService = getAuthService();
        const session = await authService.getSession();
        const isAuthenticated = session !== null;

        set({
          session,
          isAuthenticated,
          signingIn: false,
          selectedProvider: null,
        });

        if (isAuthenticated && session) {
          try {
            const syncService = getSyncService();
            await syncService.setAuthToken(session.access_token);
            logger.info("Sync service authenticated");

            await autoSyncManager.triggerSync("full", { silent: true });
          } catch (error) {
            logger.error("Failed to initialize sync service", { error });
          }
        }

        return isAuthenticated;
      } catch (error) {
        logger.error("Failed to check auth status", { error });
        set({
          isAuthenticated: false,
          signingIn: false,
          selectedProvider: null,
        });
        return false;
      }
    },

    loadSession: async () => {
      await get().checkAuthStatus();
    },
  }),
);
