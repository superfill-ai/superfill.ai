import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const PORT = Number(process.env.CDP_SAVER_PORT ?? 3002);
const OUTPUT_DIR = process.env.CDP_SAVER_DIR ?? "development/cdp-runs";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type ScreenshotPayload = {
  runId: string;
  stepNumber: number;
  screenshot: string;
  metadata?: Record<string, unknown>;
};

function stripDataUrl(data: string): string {
  const commaIndex = data.indexOf(",");
  return commaIndex >= 0 ? data.slice(commaIndex + 1) : data;
}

function buildStepBasename(stepNumber: number): string {
  return `step-${String(stepNumber).padStart(3, "0")}`;
}

async function saveScreenshot(payload: ScreenshotPayload): Promise<void> {
  const { runId, stepNumber, screenshot, metadata } = payload;

  if (!runId || typeof runId !== "string") {
    throw new Error("Missing runId");
  }
  if (!Number.isFinite(stepNumber)) {
    throw new Error("Invalid stepNumber");
  }
  if (!screenshot || typeof screenshot !== "string") {
    throw new Error("Missing screenshot");
  }

  const base64 = stripDataUrl(screenshot);
  const buffer = Buffer.from(base64, "base64");
  const runDir = resolve(process.cwd(), OUTPUT_DIR, runId);
  const basename = buildStepBasename(stepNumber);
  const imagePath = join(runDir, `${basename}.jpg`);
  const metadataPath = join(runDir, `${basename}.json`);

  await mkdir(runDir, { recursive: true });
  await writeFile(imagePath, buffer);

  const metadataPayload = {
    runId,
    stepNumber,
    savedAt: new Date().toISOString(),
    ...(metadata ?? {}),
  } satisfies Record<string, unknown>;

  await writeFile(metadataPath, JSON.stringify(metadataPayload, null, 2));
}

Bun.serve({
  port: PORT,
  fetch: async (request) => {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST" || url.pathname !== "/cdp-screenshot") {
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    }

    let payload: ScreenshotPayload;

    try {
      payload = (await request.json()) as ScreenshotPayload;
    } catch (error) {
      console.error("Failed to parse payload", error);
      return new Response("Invalid JSON", {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    try {
      await saveScreenshot(payload);
      return new Response("Saved", { status: 200, headers: CORS_HEADERS });
    } catch (error) {
      console.error("Failed to save screenshot", error);
      return new Response("Error saving screenshot", {
        status: 500,
        headers: CORS_HEADERS,
      });
    }
  },
  error(error) {
    console.error("CDP screenshot saver error", error);
    return new Response("Server error", { status: 500, headers: CORS_HEADERS });
  },
});

console.log(
  `CDP screenshot saver listening on http://localhost:${PORT}/cdp-screenshot -> ${OUTPUT_DIR}`,
);
