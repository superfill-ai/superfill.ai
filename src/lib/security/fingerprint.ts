let cachedFingerprint: string | null = null;
let fingerprintCacheTime: number = 0;
const FINGERPRINT_CACHE_DURATION = 3600000;

export async function getBrowserFingerprint(): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(
      "getBrowserFingerprint must be called from a browser context (popup/options/content script), not from background script",
    );
  }

  if (
    cachedFingerprint &&
    Date.now() - fingerprintCacheTime < FINGERPRINT_CACHE_DURATION
  ) {
    return cachedFingerprint;
  }

  const components = [
    navigator.userAgent,
    navigator.language,
    navigator.hardwareConcurrency || "unknown",
    navigator.maxTouchPoints || 0,
    navigator.platform || "unknown",
    (navigator as Navigator & { deviceMemory: number }).deviceMemory ||
      "unknown",
    await getCanvasFingerprint(),
    await getWebGLFingerprint(),
  ];

  const fingerprint = components.join("|");
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const result = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  cachedFingerprint = result;
  fingerprintCacheTime = Date.now();

  return result;
}

async function getCanvasFingerprint(): Promise<string> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.textBaseline = "top";
  ctx.font = "14px Arial";
  ctx.fillText("CANVAS_FINGERPRINT", 0, 0);
  return canvas.toDataURL();
}

async function getWebGLFingerprint(): Promise<string> {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) return "";

  try {
    return [
      gl.getParameter(gl.VENDOR),
      gl.getParameter(gl.RENDERER),
      gl.getParameter(gl.VERSION),
    ].join("|");
  } finally {
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) {
      ext.loseContext();
    }
  }
}
