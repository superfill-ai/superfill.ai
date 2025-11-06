import { createLogger } from "@/lib/logger";
import { defineProxyService } from "@webext-core/proxy-service";

const logger = createLogger("auth-service");

class AuthService {
  private redirectUrl = browser.identity.getRedirectURL();

  async initiateAuth(): Promise<{ token: string; userId: string } | null> {
    const authUrl = new URL(`${import.meta.env.WXT_WEBSITE_URL}/login?source=extension`);
    authUrl.searchParams.set('redirect', this.redirectUrl);

    return new Promise((resolve, reject) => {
      browser.identity.launchWebAuthFlow(
        {
          url: authUrl.toString(),
          interactive: true,
        },
        async (responseUrl) => {
          if (browser.runtime.lastError || !responseUrl) {
            logger.error('Auth failed:', browser.runtime.lastError);
            reject(browser.runtime.lastError);
            return;
          }

          const url = new URL(responseUrl);
          const token = url.searchParams.get('token');
          const userId = url.searchParams.get('userId');

          if (token && userId) {
            logger.info("Auth token received from OAuth flow");
            resolve({ token, userId });
          } else {
            logger.error("Missing token or userId in OAuth response");
            reject(new Error("Missing token or userId"));
          }
        }
      );
    });
  }
}

export const [registerAuthService, getAuthService] = defineProxyService(
  "AuthService",
  () => new AuthService(),
);
