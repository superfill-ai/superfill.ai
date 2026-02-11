import type { Provider, Session } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
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
};

export function useAuth(): AuthState & AuthActions {
  const queryClient = useQueryClient();
  const lastSyncedUserId = useRef<string | null>(null);

  const {
    data: session,
    isLoading: isSessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useQuery<Session | null>({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const authService = getAuthService();
      const currentSession = await authService.getSession();
      logger.debug("[useAuth] Initial session loaded:", {
        hasSession: !!currentSession,
        userId: currentSession?.user?.id,
      });
      return currentSession;
    },
    staleTime: 10000,
  });

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      logger.debug("[useAuth] Auth state changed:", {
        event: _event,
        hasSession: !!newSession,
        userId: newSession?.user?.id,
      });
      queryClient.setQueryData(["auth", "session"], newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const sessionValue = session ?? null;
  const isAuthenticated = !!sessionValue?.access_token;

  const checkAuthStatus = useCallback(async () => {
    try {
      logger.debug("[checkAuthStatus] Starting auth status check");
      const { data: refreshedSession } = await refetchSession();
      const isAuthenticated = refreshedSession !== null;

      logger.debug("[checkAuthStatus] Session retrieved:", {
        hasSession: !!refreshedSession,
        isAuthenticated,
        hasAccessToken: !!refreshedSession?.access_token,
      });

      if (isAuthenticated && refreshedSession) {
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
  }, [refetchSession]);

  const signInMutation = useMutation({
    mutationFn: async () => {
      const authService = getAuthService();
      await authService.initiateOAuth();

      logger.debug("Redirected to webapp login");

      const authenticated = await authService.waitForAuth(120000);

      logger.debug("[signIn] waitForAuth resolved:", { authenticated });

      if (!authenticated) {
        throw new Error("Authentication timeout");
      }
    },
  });

  const signIn = useCallback(async () => {
    await signInMutation.mutateAsync();
    logger.debug("[signIn] Calling checkAuthStatus after successful auth");
    await checkAuthStatus();
    logger.debug("[signIn] checkAuthStatus completed");
  }, [checkAuthStatus, signInMutation]);

  const signOutMutation = useMutation({
    mutationFn: async () => {
      const authService = getAuthService();
      await authService.clearSession();
      logger.debug("Signed out successfully");
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth", "session"], null);
    },
  });

  const signOut = useCallback(async () => {
    await signOutMutation.mutateAsync();
  }, [signOutMutation]);

  useEffect(() => {
    if (!sessionValue?.user?.id) {
      lastSyncedUserId.current = null;
      return;
    }

    if (lastSyncedUserId.current === sessionValue.user.id) {
      return;
    }

    lastSyncedUserId.current = sessionValue.user.id;
    logger.debug("[useAuth] Initializing sync with stored session");
    checkAuthStatus();
  }, [sessionValue, checkAuthStatus]);

  const error =
    (signInMutation.error instanceof Error
      ? signInMutation.error.message
      : null) ||
    (signOutMutation.error instanceof Error
      ? signOutMutation.error.message
      : null) ||
    (sessionError instanceof Error ? sessionError.message : null);

  const loading = isSessionLoading || signOutMutation.isPending;
  const signingIn = signInMutation.isPending;

  return {
    session: sessionValue,
    isAuthenticated,
    loading,
    error,
    signingIn,
    signIn,
    signOut,
    checkAuthStatus,
  };
}
