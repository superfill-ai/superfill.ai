import { createLogger } from "@/lib/logger";

const logger = createLogger("profile-scraper");

const NOISE_SELECTORS = [
  "script",
  "style",
  "nav",
  "footer",
  "header",
  "aside",
  ".ads",
  ".advertisement",
  ".cookie-banner",
  ".popup",
  ".modal",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  ".msg-overlay-list-bubble",
  ".global-nav",
  ".search-global-typeahead",
  ".Masthead",
  ".trends",
];

function extractPageContent(): string {
  const mainContent =
    document.querySelector("main") ||
    document.querySelector('[role="main"]') ||
    document.querySelector(".main-content") ||
    document.querySelector("#main") ||
    document.querySelector("article") ||
    document.body;

  if (!mainContent) {
    return document.body.innerText;
  }

  const clone = mainContent.cloneNode(true) as HTMLElement;

  for (const selector of NOISE_SELECTORS) {
    for (const el of clone.querySelectorAll(selector)) {
      el.remove();
    }
  }

  let text = clone.innerText || clone.textContent || "";
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  const links: string[] = [];
  mainContent.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;

    let fullUrl = href;
    if (href.startsWith("/")) {
      fullUrl = `${window.location.origin}${href}`;
    } else if (
      !href.startsWith("http") &&
      !href.startsWith("mailto:") &&
      !href.startsWith("tel:")
    ) {
      fullUrl = `${window.location.origin}/${href}`;
    }

    const linkText = (a as HTMLElement).innerText?.trim();
    if (linkText && fullUrl.startsWith("http")) {
      links.push(`${linkText}: ${fullUrl}`);
    } else if (fullUrl.startsWith("mailto:") || fullUrl.startsWith("tel:")) {
      links.push(fullUrl);
    }
  });

  if (links.length > 0) {
    const uniqueLinks = [...new Set(links)];
    text += "\n\n--- LINKS FOUND ON PAGE ---\n";
    text += uniqueLinks.slice(0, 100).join("\n");
  }

  text += "\n\n--- PAGE INFO ---\n";
  text += `URL: ${window.location.href}\n`;
  text += `Title: ${document.title}\n`;

  logger.debug("Extracted page content length:", text.length);
  return text;
}

async function scrollToLoadContent(): Promise<void> {
  for (const step of [0.25, 0.5, 0.75, 1]) {
    window.scrollTo(0, document.body.scrollHeight * step);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  window.scrollTo(0, 0);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",

  async main() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("superfill_scrape") !== "true") {
      return;
    }

    logger.debug("Profile scraper activated for:", window.location.href);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await scrollToLoadContent();

    try {
      const pageContent = extractPageContent();
      const pageUrl = window.location.href.split("?")[0];
      const pageTitle = document.title;

      browser.runtime.sendMessage({
        type: "PROFILE_SCRAPE_RESULT",
        success: true,
        rawContent: pageContent,
        pageUrl,
        pageTitle,
      });
    } catch (error) {
      logger.error("Error extracting content:", error);
      browser.runtime.sendMessage({
        type: "PROFILE_SCRAPE_RESULT",
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to extract page content",
      });
    }
  },
});
