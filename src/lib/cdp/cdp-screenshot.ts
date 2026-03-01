import { createLogger } from "@/lib/logger";
import type { CDPInteractiveElement } from "@/types/cdp";
import type { CDPConnection } from "./cdp-connection";

const logger = createLogger("cdp-screenshot");

/**
 * Captures a screenshot of the current viewport via CDP.
 * Returns base64-encoded PNG data.
 */
export async function captureScreenshot(
  connection: CDPConnection,
  options?: {
    fullPage?: boolean;
    quality?: number;
    format?: "png" | "jpeg" | "webp";
  },
): Promise<string> {
  const format = options?.format ?? "jpeg";
  const quality = options?.quality ?? 75;

  const params: Record<string, unknown> = {
    format,
  };

  if (format !== "png") {
    params.quality = quality;
  }

  if (options?.fullPage) {
    // Get page dimensions for full page capture
    const layoutMetrics = await connection.send<{
      contentSize: { width: number; height: number };
    }>("Page.getLayoutMetrics");

    params.clip = {
      x: 0,
      y: 0,
      width: layoutMetrics.contentSize.width,
      height: layoutMetrics.contentSize.height,
      scale: 1,
    };
  }

  const result = await connection.send<{ data: string }>(
    "Page.captureScreenshot",
    params,
  );

  logger.info(
    `Screenshot captured (${format}, ${options?.fullPage ? "full page" : "viewport"})`,
  );

  return result.data;
}

/**
 * Injects visual annotations onto the page showing element indices.
 * Each interactive element gets a small colored badge with its index number.
 * Returns base64-encoded screenshot with annotations.
 */
export async function captureAnnotatedScreenshot(
  connection: CDPConnection,
  elements: CDPInteractiveElement[],
  options?: {
    quality?: number;
    format?: "png" | "jpeg" | "webp";
  },
): Promise<string> {
  // Inject annotation overlay
  await injectAnnotations(connection, elements);

  // Small delay to ensure rendering completes
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Take screenshot with annotations visible
  const screenshot = await captureScreenshot(connection, {
    fullPage: false,
    quality: options?.quality ?? 75,
    format: options?.format ?? "jpeg",
  });

  // Remove annotations
  await removeAnnotations(connection);

  return screenshot;
}

/**
 * Injects annotation badges onto the page at each interactive element's position.
 */
async function injectAnnotations(
  connection: CDPConnection,
  elements: CDPInteractiveElement[],
): Promise<void> {
  const annotationScript = `
    (() => {
      // Remove any existing annotations
      const existing = document.getElementById('cdp-agent-annotations');
      if (existing) existing.remove();
      
      const container = document.createElement('div');
      container.id = 'cdp-agent-annotations';
      container.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
      
      const elements = ${JSON.stringify(
        elements.map((e) => ({
          index: e.index,
          x: e.boundingBox.x,
          y: e.boundingBox.y,
          width: e.boundingBox.width,
          height: e.boundingBox.height,
        })),
      )};
      
      for (const el of elements) {
        // Badge with index number
        const badge = document.createElement('div');
        badge.style.cssText = [
          'position: absolute',
          'left: ' + (el.x - 4) + 'px',
          'top: ' + (el.y - 4) + 'px',
          'min-width: 18px',
          'height: 18px',
          'background: #FF4444',
          'color: white',
          'font-size: 11px',
          'font-weight: bold',
          'font-family: Arial, sans-serif',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'border-radius: 9px',
          'padding: 0 4px',
          'line-height: 1',
          'box-shadow: 0 1px 3px rgba(0,0,0,0.4)',
          'pointer-events: none',
          'z-index: 2147483647',
        ].join(';');
        badge.textContent = String(el.index);
        container.appendChild(badge);
        
        // Highlight border around element
        const highlight = document.createElement('div');
        highlight.style.cssText = [
          'position: absolute',
          'left: ' + (el.x - 2) + 'px',
          'top: ' + (el.y - 2) + 'px',
          'width: ' + (el.width + 4) + 'px',
          'height: ' + (el.height + 4) + 'px',
          'border: 2px solid #FF4444',
          'border-radius: 3px',
          'pointer-events: none',
          'z-index: 2147483646',
        ].join(';');
        container.appendChild(highlight);
      }
      
      document.documentElement.appendChild(container);
      return true;
    })()
  `;

  await connection.send("Runtime.evaluate", {
    expression: annotationScript,
    returnByValue: true,
  });

  logger.info(`Injected ${elements.length} annotation badges`);
}

/**
 * Removes annotation overlay from the page.
 */
async function removeAnnotations(connection: CDPConnection): Promise<void> {
  await connection.send("Runtime.evaluate", {
    expression: `(() => {
      const el = document.getElementById('cdp-agent-annotations');
      if (el) el.remove();
      // Also clean up data-cdp-index attributes
      document.querySelectorAll('[data-cdp-index]').forEach(e => e.removeAttribute('data-cdp-index'));
      return true;
    })()`,
    returnByValue: true,
  });
}
