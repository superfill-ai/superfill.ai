import type { Session } from "@supabase/supabase-js";
import { defineProxyService } from "@webext-core/proxy-service";
import { createLogger } from "@/lib/logger";
import {
  clearSupabaseAuth,
  isSupabaseAuthenticated,
  setSupabaseAuth,
  supabase,
} from "../supabase/client";

const logger = createLogger("auth-service");

class AuthService {
  private readonly WEBSITE_URL =
    import.meta.env.WXT_WEBSITE_URL || "https://superfill.ai";

  async initiateOAuth(): Promise<void> {
    try {
      const loginUrl = `${this.WEBSITE_URL}/login?source=extension`;
      logger.info(`Redirecting to webapp login: ${loginUrl}`);

      await browser.tabs.create({ url: loginUrl });
    } catch (error) {
      logger.error("Failed to initiate OAuth:", error);
      throw error;
    }
  }

  async setAuthToken(
    accessToken: string,
    refreshToken?: string,
  ): Promise<void> {
    try {
      await setSupabaseAuth(accessToken, refreshToken);
      logger.info("Sync service authenticated with Supabase");
    } catch (error) {
      logger.error("Failed to set auth token:", error);
      throw error;
    }
  }

  async clearAuth(): Promise<void> {
    await clearSupabaseAuth();
    logger.info("Sync service auth cleared");
  }

  async isAuthenticated(): Promise<boolean> {
    return await isSupabaseAuthenticated();
  }

  async getSession(): Promise<Session | null> {
    try {
      logger.info("[getSession] Retrieving session from Supabase");

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        logger.error("[getSession] Error getting session:", error);
        return null;
      }

      if (!session) {
        logger.info("[getSession] No session found");
        return null;
      }

      logger.info("[getSession] Session retrieved successfully", {
        userId: session.user?.id,
        hasAccessToken: !!session.access_token,
        hasRefreshToken: !!session.refresh_token,
      });

      return session;
    } catch (error) {
      logger.error("Failed to get session:", error);
      return null;
    }
  }

  async clearSession(): Promise<void> {
    try {
      await this.clearAuth();
      logger.info("Session cleared successfully");
    } catch (error) {
      logger.error("Failed to clear session:", error);
      throw error;
    }
  }

  async waitForAuth(timeoutMs = 300000): Promise<boolean> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        const session = await this.getSession();
        if (session?.access_token) {
          cleanup();
          logger.info("Authentication detected!");
          resolve(true);
        }
      }, 500);

      const timeout = setTimeout(() => {
        cleanup();
        logger.warn("Authentication timeout");
        resolve(false);
      }, timeoutMs);

      const cleanup = () => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
      };

      logger.info("Waiting for authentication tokens to be stored");
    });
  }

  async getCurrentUser() {
    const session = await this.getSession();
    if (!session?.user) return null;

    return {
      id: session.user.id,
      email: session.user.email || null,
    };
  }
}

export const [registerAuthService, getAuthService] = defineProxyService(
  "AuthService",
  () => new AuthService(),
);
