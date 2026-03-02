import { createLogger, DEBUG } from "@/lib/logger";

const logger = createLogger("cdp-screenshot-saver");

/**
 * Generates a run ID based on the current date and time.
 * Format: YYYY-MM-DD_HH-MM-SS
 */
export function createRunId(): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
  return `${date}_${time}`;
}

/**
 * Saves a base64-encoded screenshot to the local downloads folder
 * using the browser downloads API. Only saves in DEBUG mode.
 *
 * Files are saved under: superfill-debug/cdp-runs/{runId}/step-{N}.jpg
 */
export async function saveScreenshotLocally(
  runId: string,
  stepNumber: number,
  base64Screenshot: string,
  metadata?: {
    action?: string;
    url?: string;
    elementCount?: number;
  },
): Promise<void> {
  if (!DEBUG) return;

  try {
    const dataUrl = base64Screenshot.startsWith("data:")
      ? base64Screenshot
      : `data:image/jpeg;base64,${base64Screenshot}`;

    const filename = `superfill-debug/cdp-runs/${runId}/step-${String(stepNumber).padStart(3, "0")}.jpg`;

    await browser.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
      conflictAction: "uniquify",
    });

    logger.debug(
      `[Run ${runId}] Saved screenshot for step ${stepNumber}`,
      metadata,
    );
  } catch (error) {
    // Don't let screenshot saving failures break the agent loop
    logger.warn(`Failed to save screenshot for step ${stepNumber}:`, error);
  }
}
