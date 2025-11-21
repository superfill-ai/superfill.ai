import type { Provider, Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthService } from "@/lib/auth/auth-service";
import { createLogger } from "@/lib/logger";
import { supabase } from "@/lib/supabase/client";
import { autoSyncManager } from "@/lib/sync/auto-sync-manager";

const logger = createLogger("hook:auth");

type AuthState = {
  session: Session | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  signingIn: boolean;
};

type AuthActions = {
  signIn: (provider?: Provider) => Promise<void>;
  signOut: () => Promise<void>;
  checkAuthStatus: () => Promise<boolean>;
  loadSession: () => Promise<void>;
};

export function useAuth(): AuthState & AuthActions {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const hasInitialized = useRef(false);

  useEffect(() => {
    const fetchAndWatch = async () => {
      const authService = getAuthService();
      const currentSession = await authService.getSession();
      logger.info("[useAuth] Initial session loaded:", {
        hasSession: !!currentSession,
        userId: currentSession?.user?.id,
      });
      setSession(currentSession);
    };

    fetchAndWatch();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      logger.info("[useAuth] Auth state changed:", {
        event: _event,
        hasSession: !!newSession,
        userId: newSession?.user?.id,
      });
      setSession(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const isAuthenticated = !!session?.access_token;

  const checkAuthStatus = useCallback(async () => {
    try {
      logger.info("[checkAuthStatus] Starting auth status check");
      const authService = getAuthService();
      const session = await authService.getSession();
      const isAuthenticated = session !== null;

      logger.info("[checkAuthStatus] Session retrieved:", {
        hasSession: !!session,
        isAuthenticated,
        hasAccessToken: !!session?.access_token,
      });

      if (isAuthenticated && session) {
        try {
          await autoSyncManager.triggerSync("full", { silent: true });
        } catch (error) {
          logger.error("Failed to initialize sync service", { error });
        }
      }

      return isAuthenticated;
    } catch (error) {
      logger.error("Failed to check auth status", { error });
      return false;
    }
  }, []);

  const signIn = useCallback(async () => {
    try {
      setSigningIn(true);
      setError(null);

      const authService = getAuthService();
      await authService.initiateOAuth();

      logger.info("Redirected to webapp login");

      const authenticated = await authService.waitForAuth(300000);

      logger.info("[signIn] waitForAuth resolved:", { authenticated });

      if (authenticated) {
        logger.info("[signIn] Calling checkAuthStatus after successful auth");
        await checkAuthStatus();
        logger.info("[signIn] checkAuthStatus completed");
      } else {
        setError("Authentication timeout");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sign in";
      logger.error("Failed to sign in", { error });
      setError(errorMessage);
      throw error;
    } finally {
      setSigningIn(false);
    }
  }, [checkAuthStatus]);

  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const authService = getAuthService();
      await authService.clearSession();

      logger.info("Signed out successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sign out";
      logger.error("Failed to sign out", { error });
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSession = useCallback(async () => {
    await checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    if (!hasInitialized.current && isAuthenticated && session) {
      hasInitialized.current = true;
      logger.info("[useAuth] Initializing sync with stored session");
      checkAuthStatus();
    }
  }, [isAuthenticated, session, checkAuthStatus]);

  return {
    session,
    isAuthenticated,
    loading,
    error,
    signingIn,
    signIn,
    signOut,
    checkAuthStatus,
    loadSession,
  };
}
