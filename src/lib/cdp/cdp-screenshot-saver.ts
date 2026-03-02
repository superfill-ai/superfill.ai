import { createLogger, DEBUG } from "@/lib/logger";

const logger = createLogger("cdp-screenshot-saver");
const DEFAULT_SAVER_URL = "http://localhost:3002/cdp-screenshot";
const saverUrl =
  (import.meta.env.VITE_CDP_SAVER_URL as string | undefined) ??
  DEFAULT_SAVER_URL;

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
    const normalized = base64Screenshot.startsWith("data:")
      ? base64Screenshot
      : `data:image/jpeg;base64,${base64Screenshot}`;

    const response = await fetch(saverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId,
        stepNumber,
        screenshot: normalized,
        metadata,
      }),
    });

    if (!response.ok) {
      throw new Error(`Saver responded with ${response.status}`);
    }

    logger.debug(
      `[Run ${runId}] Saved screenshot for step ${stepNumber} via dev saver`,
      metadata,
    );
  } catch (error) {
    logger.warn(
      `Failed to save screenshot for step ${stepNumber} via dev saver:`,
      error,
    );
  }
}
