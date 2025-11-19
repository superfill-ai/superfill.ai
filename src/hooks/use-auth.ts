import type { Provider, Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { getAuthService } from "@/lib/auth/auth-service";
import { createLogger } from "@/lib/logger";
import { autoSyncManager } from "@/lib/sync/auto-sync-manager";
import { getSyncService } from "@/lib/sync/sync-service";

const logger = createLogger("hook:auth");

type AuthState = {
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

export function useAuth(): AuthState & AuthActions {
  const [state, setState] = useState<AuthState>({
    session: null,
    isAuthenticated: false,
    loading: false,
    error: null,
    signingIn: false,
    selectedProvider: null,
  });

  const signIn = useCallback(async (provider: Provider) => {
    try {
      setState((prev) => ({
        ...prev,
        signingIn: true,
        selectedProvider: provider,
        error: null,
      }));

      const authService = getAuthService();
      await authService.initiateOAuth(provider);

      logger.info(`OAuth flow initiated for ${provider}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sign in";
      logger.error("Failed to sign in", { error });
      setState((prev) => ({
        ...prev,
        signingIn: false,
        error: errorMessage,
        selectedProvider: null,
      }));
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const authService = getAuthService();
      await authService.clearSession();

      setState({
        session: null,
        isAuthenticated: false,
        loading: false,
        error: null,
        signingIn: false,
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
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
      throw error;
    }
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      const authService = getAuthService();
      const session = await authService.getSession();
      const isAuthenticated = session !== null;

      setState((prev) => ({
        ...prev,
        session,
        isAuthenticated,
        signingIn: false,
        selectedProvider: null,
      }));

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
      setState((prev) => ({
        ...prev,
        isAuthenticated: false,
        signingIn: false,
        selectedProvider: null,
      }));
      return false;
    }
  }, []);

  const loadSession = useCallback(async () => {
    await checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  return {
    ...state,
    signIn,
    signOut,
    checkAuthStatus,
    loadSession,
  };
}
