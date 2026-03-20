import { createLogger } from "@/lib/logger";
import { sendCommand } from "./cdp-service";

const logger = createLogger("cdp-screenshot");

interface ScreenshotResponse {
  data: string;
}

interface LayoutMetrics {
  visualViewport: {
    clientWidth: number;
    clientHeight: number;
    scale: number;
  };
}

const MAX_WIDTH = 1024;

export async function captureScreenshot(tabId: number): Promise<string> {
  const metrics = await sendCommand<LayoutMetrics>(
    tabId,
    "Page.getLayoutMetrics",
  );

  const vw = metrics?.visualViewport;
  const viewportWidth = vw?.clientWidth ?? 1280;
  const viewportHeight = vw?.clientHeight ?? 800;
  const scale = vw?.scale ?? 1;

  const clip =
    viewportWidth * scale > MAX_WIDTH
      ? {
          x: 0,
          y: 0,
          width: viewportWidth,
          height: viewportHeight,
          scale: MAX_WIDTH / viewportWidth,
        }
      : undefined;

  const result = await sendCommand<ScreenshotResponse>(
    tabId,
    "Page.captureScreenshot",
    {
      format: "jpeg",
      quality: 60,
      ...(clip ? { clip } : {}),
    },
  );

  logger.info(
    `Screenshot captured: ${((result.data.length * 0.75) / 1024).toFixed(0)}KB`,
  );

  return result.data;
}
