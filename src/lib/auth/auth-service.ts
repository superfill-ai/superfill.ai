import { defineProxyService } from "@webext-core/proxy-service";
import { createLogger } from "@/lib/logger";
import { generatePKCE, generateState } from "./crypto-utils";

const logger = createLogger("auth-service");

interface PendingAuth {
  verifier: string;
  state: string;
  timestamp: number;
}

class AuthService {
  private redirectUrl = browser.identity.getRedirectURL();
  private pendingAuth: Map<string, PendingAuth> = new Map();
  private readonly AUTH_TIMEOUT = 5 * 60 * 1000;

  constructor() {
    setInterval(() => this.cleanupExpiredAuth(), 60 * 1000);
  }

  private cleanupExpiredAuth(): void {
    const now = Date.now();
    for (const [state, pending] of this.pendingAuth.entries()) {
      if (now - pending.timestamp > this.AUTH_TIMEOUT) {
        this.pendingAuth.delete(state);
        logger.debug(`Cleaned up expired auth state: ${state}`);
      }
    }
  }

  async initiateAuth(): Promise<{ token: string; userId: string } | null> {
    const { verifier, challenge } = await generatePKCE();
    const state = generateState();

    this.pendingAuth.set(state, {
      verifier,
      state,
      timestamp: Date.now(),
    });

    const authUrl = new URL(`${import.meta.env.WXT_WEBSITE_URL}/login`);
    authUrl.searchParams.set("source", "extension");
    authUrl.searchParams.set("redirect_uri", this.redirectUrl);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", state);

    logger.info("Initiating secure OAuth flow with PKCE");

    return new Promise((resolve, reject) => {
      browser.identity.launchWebAuthFlow(
        {
          url: authUrl.toString(),
          interactive: true,
        },
        async (responseUrl) => {
          if (browser.runtime.lastError || !responseUrl) {
            logger.error("Auth failed:", browser.runtime.lastError);
            reject(browser.runtime.lastError);
            return;
          }

          try {
            const url = new URL(responseUrl);
            const code = url.searchParams.get("code");
            const returnedState = url.searchParams.get("state");

            if (!code || !returnedState) {
              logger.error("Missing code or state in OAuth response");
              reject(new Error("Missing code or state parameter"));
              return;
            }

            const pending = this.pendingAuth.get(returnedState);

            if (!pending || pending.state !== returnedState) {
              logger.error("State mismatch - possible CSRF attack");
              reject(new Error("Invalid state parameter - CSRF detected"));
              return;
            }

            logger.info("Authorization code received, exchanging for token");

            const tokens = await this.exchangeCodeForToken(
              code,
              pending.verifier,
            );

            this.pendingAuth.delete(returnedState);

            logger.info("Successfully authenticated with PKCE flow");
            resolve(tokens);
          } catch (error) {
            logger.error("Error processing auth response:", error);
            reject(error);
          }
        },
      );
    });
  }

  private async exchangeCodeForToken(
    code: string,
    verifier: string,
  ): Promise<{ token: string; userId: string }> {
    const apiUrl =
      import.meta.env.WXT_API_URL || import.meta.env.WXT_WEBSITE_URL;

    try {
      const extensionId = browser.runtime.id;
      const manifest = browser.runtime.getManifest();

      const response = await fetch(`${apiUrl}/api/auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Extension-ID": extensionId,
          "X-Extension-Version": manifest.version,
        },
        body: JSON.stringify({
          code,
          code_verifier: verifier,
          redirect_uri: this.redirectUrl,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error("Token exchange failed:", error);
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.token || !data.userId) {
        throw new Error("Invalid token response from server");
      }

      return {
        token: data.token,
        userId: data.userId,
      };
    } catch (error) {
      logger.error("Token exchange request failed:", error);
      throw new Error("Failed to exchange authorization code for token");
    }
  }
}

export const [registerAuthService, getAuthService] = defineProxyService(
  "AuthService",
  () => new AuthService(),
);
