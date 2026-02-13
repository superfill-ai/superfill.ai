import type { Session } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthService } from "@/lib/auth/auth-service";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { supabase } from "@/lib/supabase/client";
import { autoSyncManager } from "@/lib/sync/auto-sync-manager";

const logger = createLogger("hook:auth");

type AuthState = {
  session: Session | null;
  isAuthenticated: boolean;
  isActive: boolean;
  pendingApproval: boolean;
  inactiveMessage: string | null;
  loading: boolean;
  error: string | null;
  signingIn: boolean;
};

type AuthActions = {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  checkAuthStatus: () => Promise<boolean>;
};

const WEBSITE_URL = import.meta.env.WXT_WEBSITE_URL || "https://superfill.ai";
const USER_STATUS_ENDPOINT = `${WEBSITE_URL}/routes/api/user/status`;

type UserStatus = {
  is_active: boolean;
  plan?: string;
};

export function useAuth(): AuthState & AuthActions {
  const queryClient = useQueryClient();
  const lastSyncedUserId = useRef<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [inactiveMessage, setInactiveMessage] = useState<string | null>(null);

  const clearInactiveState = useCallback(() => {
    setPendingApproval(false);
    setInactiveMessage(null);
  }, []);

  const handleInactiveAccount = useCallback(
    async (message?: string) => {
      const authService = getAuthService();
      await authService.clearSession();
      queryClient.setQueryData(["auth", "session"], null);

      const currentSettings = await storage.aiSettings.getValue();
      if (currentSettings.cloudModelsEnabled) {
        await storage.aiSettings.setValue({
          ...currentSettings,
          cloudModelsEnabled: false,
        });
      }

      setPendingApproval(true);
      setInactiveMessage(
        message ?? "Account pending approval. Please contact support.",
      );
    },
    [queryClient],
  );

  const fetchUserStatus = useCallback(
    async (accessToken: string): Promise<UserStatus> => {
      const response = await fetch(USER_STATUS_ENDPOINT, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 403) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        await handleInactiveAccount(errorData.error);
        return { is_active: false };
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch user status: ${response.status}`);
      }

      clearInactiveState();
      return response.json() as Promise<UserStatus>;
    },
    [clearInactiveState, handleInactiveAccount],
  );

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

  const {
    data: userStatus,
    isLoading: isUserStatusLoading,
    error: userStatusError,
  } = useQuery<UserStatus | null>({
    queryKey: ["auth", "user-status", sessionValue?.user?.id],
    enabled: !!sessionValue?.access_token,
    queryFn: async () => {
      if (!sessionValue?.access_token) {
        clearInactiveState();
        return null;
      }

      return fetchUserStatus(sessionValue.access_token);
    },
    staleTime: 10000,
  });

  const isActive = userStatus?.is_active === true;
  const isAuthenticated = !!sessionValue?.access_token && isActive;

  const checkAuthStatus = useCallback(async () => {
    try {
      logger.debug("[checkAuthStatus] Starting auth status check");
      const { data: refreshedSession } = await refetchSession();
      const hasSession = refreshedSession !== null;

      logger.debug("[checkAuthStatus] Session retrieved:", {
        hasSession,
        hasAccessToken: !!refreshedSession?.access_token,
      });

      if (hasSession && refreshedSession) {
        const status = await fetchUserStatus(refreshedSession.access_token);
        if (!status.is_active) {
          return false;
        }

        try {
          await autoSyncManager.triggerSync("full", { silent: true });
        } catch (error) {
          logger.error("Failed to initialize sync service", { error });
        }
      }

      return hasSession;
    } catch (error) {
      logger.error("Failed to check auth status", { error });
      return false;
    }
  }, [fetchUserStatus, refetchSession]);

  const signInMutation = useMutation({
    mutationFn: async () => {
      const authService = getAuthService();
      await authService.initiateOAuth();

      logger.debug("Redirected to webapp login");

      const authenticated = await authService.waitForAuth(120000);

      logger.debug("[signIn] waitForAuth resolved:", { authenticated });

      if (!authenticated) {
        throw new Error(
          "Authentication timeout. If you were redirected back to superfill.ai, your account may be pending approval.",
        );
      }
    },
  });

  const signIn = useCallback(async () => {
    clearInactiveState();
    await signInMutation.mutateAsync();
    logger.debug("[signIn] Calling checkAuthStatus after successful auth");
    await checkAuthStatus();
    logger.debug("[signIn] checkAuthStatus completed");
  }, [checkAuthStatus, clearInactiveState, signInMutation]);

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
    clearInactiveState();
    await signOutMutation.mutateAsync();
  }, [clearInactiveState, signOutMutation]);

  useEffect(() => {
    if (!sessionValue?.user?.id || !isAuthenticated) {
      lastSyncedUserId.current = null;
      return;
    }

    if (lastSyncedUserId.current === sessionValue.user.id) {
      return;
    }

    lastSyncedUserId.current = sessionValue.user.id;
    logger.debug("[useAuth] Initializing sync with stored session");
    checkAuthStatus();
  }, [sessionValue, checkAuthStatus, isAuthenticated]);

  const error =
    (signInMutation.error instanceof Error
      ? signInMutation.error.message
      : null) ||
    (signOutMutation.error instanceof Error
      ? signOutMutation.error.message
      : null) ||
    (sessionError instanceof Error
      ? sessionError.message
      : userStatusError instanceof Error
        ? userStatusError.message
        : null);

  const loading =
    isSessionLoading || isUserStatusLoading || signOutMutation.isPending;
  const signingIn = signInMutation.isPending;

  return {
    session: sessionValue,
    isAuthenticated,
    isActive,
    pendingApproval,
    inactiveMessage,
    loading,
    error,
    signingIn,
    signIn,
    signOut,
    checkAuthStatus,
  };
}
