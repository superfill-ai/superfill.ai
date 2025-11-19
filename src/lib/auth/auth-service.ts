import type { Provider, Session } from "@supabase/supabase-js";
import { defineProxyService } from "@webext-core/proxy-service";
import { createLogger } from "@/lib/logger";
import { supabase } from "@/lib/supabase/client";

const logger = createLogger("auth-service");

class AuthService {
  private redirectUrl = browser.identity.getRedirectURL();

  async initiateOAuth(provider: Provider): Promise<void> {
    try {
      logger.info(
        `Initiating OAuth flow with ${provider} with redirect URL: ${this.redirectUrl}`,
      );

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: this.redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error("No OAuth URL returned");

      await browser.tabs.create({ url: data.url });

      logger.info("OAuth flow initiated, waiting for callback");
    } catch (error) {
      logger.error("Failed to initiate OAuth:", error);
      throw error;
    }
  }

  async getSession(): Promise<Session | null> {
    try {
      const result = await browser.storage.local.get("superfill:auth:session");
      const session = result["superfill:auth:session"] as Session | undefined;

      if (!session) return null;

      const { data, error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (error) {
        logger.error("Session validation failed:", error);
        await this.clearSession();
        return null;
      }

      return data.session;
    } catch (error) {
      logger.error("Failed to get session:", error);
      return null;
    }
  }

  async clearSession(): Promise<void> {
    try {
      await browser.storage.local.remove("superfill:auth:session");
      await supabase.auth.signOut();
      logger.info("Session cleared successfully");
    } catch (error) {
      logger.error("Failed to clear session:", error);
      throw error;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }

  async getCurrentUser() {
    const session = await this.getSession();
    if (!session) return null;

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      logger.error("Failed to get user:", error);
      return null;
    }

    return user;
  }
}

export const [registerAuthService, getAuthService] = defineProxyService(
  "AuthService",
  () => new AuthService(),
);
