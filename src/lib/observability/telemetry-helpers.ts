import type { SpanProcessor } from "@opentelemetry/sdk-trace-web";
import { createLogger, DEBUG } from "@/lib/logger";

let spanProcessorPromise: Promise<SpanProcessor> | null = null;

const logger = createLogger("telemetry-helpers");

async function getSpanProcessor() {
  if (!spanProcessorPromise) {
    spanProcessorPromise = (async () => {
      const { LangfuseSpanProcessor } = await import("@langfuse/otel");
      const publicKey = import.meta.env.WXT_LANGFUSE_PUBLIC_KEY || "";
      const secretKey = import.meta.env.WXT_LANGFUSE_SECRET_KEY || "";
      const baseUrl =
        import.meta.env.WXT_LANGFUSE_BASEURL || "https://cloud.langfuse.com";

      if (!publicKey || !secretKey) {
        console.warn(
          "[telemetry] Langfuse keys are missing; spans will not be exported.",
        );
      }

      return new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl,
      });
    })();
  }

  return spanProcessorPromise;
}

export async function updateObservation(data: {
  input?: unknown;
  output?: unknown;
  level?: "DEFAULT" | "DEBUG" | "WARNING" | "ERROR";
}): Promise<void> {
  if (!DEBUG) return;

  try {
    const { updateActiveObservation } = await import("@langfuse/tracing");

    updateActiveObservation(data);
  } catch (error) {
    logger.warn("updateObservation failed:", error);
  }
}

export async function updateTrace(data: {
  name?: string;
  input?: unknown;
  output?: unknown;
}): Promise<void> {
  if (!DEBUG) return;

  try {
    const { updateActiveTrace } = await import("@langfuse/tracing");

    updateActiveTrace(data);
  } catch (error) {
    logger.warn("updateTrace failed:", error);
  }
}

export async function endActiveSpan(): Promise<void> {
  if (!DEBUG) return;

  try {
    const { trace } = await import("@opentelemetry/api");

    trace.getActiveSpan()?.end();
  } catch (error) {
    logger.warn("endActiveSpan failed:", error);
  }
}

export async function flushSpanProcessor(): Promise<void> {
  if (!DEBUG) return;

  const processor = await getSpanProcessor();
  await processor.forceFlush();
}

let providerInitialized = false;

export async function initializeTracerProvider(): Promise<void> {
  if (!DEBUG || providerInitialized) return;

  try {
    const { WebTracerProvider } = await import("@opentelemetry/sdk-trace-web");
    const processor = await getSpanProcessor();

    const tracerProvider = new WebTracerProvider({
      spanProcessors: [processor as SpanProcessor],
    });

    tracerProvider.register();
    providerInitialized = true;
  } catch (error) {
    logger.warn("initializeTracerProvider failed:", error);
  }
}
