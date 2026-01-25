import { createLogger } from "@/lib/logger";
import type {
  ProfileContentResult,
  ProfileScraperResult,
} from "@/types/profile";
import { convertToImportItems, parseProfileWithAI } from "./profile-parser";

const logger = createLogger("profile-service");

const SCRAPE_TIMEOUT = 60000;

let profileService: ProfileService | null = null;

export function getProfileService(): ProfileService {
  if (!profileService) {
    profileService = new ProfileService();
  }
  return profileService;
}

export function registerProfileService(): void {
  profileService = new ProfileService();
}

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost/i,
  /^127\./,
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
];

export class ProfileService {
  private scrapeTabId: number | null = null;
  private scrapeResolve: ((result: ProfileScraperResult) => void) | null = null;
  private onStatusChange: ((status: string) => void) | null = null;

  constructor() {
    this.setupMessageListener();
  }

  private setupMessageListener(): void {
    browser.runtime.onMessage.addListener((message, sender) => {
      if (message.type === "PROFILE_SCRAPE_RESULT") {
        logger.debug("Received scrape result from content script");
        this.handleContentResult(
          message as ProfileContentResult,
          sender as { tab?: { id?: number } },
        );
      }
    });
  }

  private async handleContentResult(
    result: ProfileContentResult,
    sender: { tab?: { id?: number } },
  ): Promise<void> {
    if (this.scrapeTabId && sender.tab?.id === this.scrapeTabId) {
      browser.tabs.remove(this.scrapeTabId).catch(() => {});
      this.scrapeTabId = null;
    }

    if (!this.scrapeResolve) {
      logger.warn("No scrape resolver available");
      return;
    }

    if (!result.success || !result.rawContent) {
      this.scrapeResolve({
        success: false,
        error: result.error || "Failed to extract page content",
      });
      this.scrapeResolve = null;
      return;
    }

    try {
      this.onStatusChange?.("parsing");
      logger.debug("Starting AI parsing of profile content");

      const extractedItems = await parseProfileWithAI(result.rawContent);
      const importItems = convertToImportItems(extractedItems);

      this.scrapeResolve({
        success: true,
        items: importItems,
      });
    } catch (error) {
      logger.error("AI parsing failed:", error);
      this.scrapeResolve({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to parse profile with AI",
      });
    } finally {
      this.scrapeResolve = null;
      this.onStatusChange = null;
    }
  }

  validateUrl(url: string): { valid: boolean; url?: string; error?: string } {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      return { valid: false, error: "Please enter a URL" };
    }

    let normalizedUrl = trimmedUrl;
    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://")
    ) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      const parsed = new URL(normalizedUrl);

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { valid: false, error: "Only HTTP/HTTPS URLs are supported" };
      }

      if (
        BLOCKED_HOSTNAME_PATTERNS.some((pattern) =>
          pattern.test(parsed.hostname),
        )
      ) {
        return { valid: false, error: "Local/private URLs are not supported" };
      }

      return { valid: true, url: normalizedUrl };
    } catch {
      return { valid: false, error: "Invalid URL format" };
    }
  }

  async scrapeProfileUrl(
    url: string,
    onStatusChange?: (status: string) => void,
  ): Promise<ProfileScraperResult> {
    logger.debug("Starting profile scrape for:", url);

    const validation = this.validateUrl(url);
    if (!validation.valid || !validation.url) {
      return {
        success: false,
        error: validation.error || "Invalid URL",
      };
    }

    const targetUrl = validation.url;

    return new Promise((resolve) => {
      this.scrapeResolve = resolve;
      this.onStatusChange = onStatusChange || null;

      const timeout = setTimeout(() => {
        if (this.scrapeResolve) {
          this.scrapeResolve({
            success: false,
            error: "Scraping timed out. The page might be slow to load.",
          });
          this.scrapeResolve = null;
          this.onStatusChange = null;
        }

        if (this.scrapeTabId) {
          browser.tabs.remove(this.scrapeTabId).catch(() => {});
          this.scrapeTabId = null;
        }
      }, SCRAPE_TIMEOUT);

      const urlWithFlag = new URL(targetUrl);
      urlWithFlag.searchParams.set("superfill_scrape", "true");

      browser.tabs
        .create({
          url: urlWithFlag.toString(),
          active: false,
        })
        .then((tab) => {
          if (tab.id) {
            this.scrapeTabId = tab.id;
            logger.debug("Opened profile tab:", tab.id);
          }
        })
        .catch((error) => {
          clearTimeout(timeout);
          logger.error("Failed to open profile tab:", error);
          resolve({
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to open URL",
          });
        });
    });
  }
}
