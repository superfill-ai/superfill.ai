import type { SpanProcessor } from "@opentelemetry/sdk-trace-web";
import { DEBUG } from "@/lib/logger";

let spanProcessorInstance: SpanProcessor | null = null;

async function getSpanProcessor() {
  if (!spanProcessorInstance) {
    const { LangfuseSpanProcessor } = await import("@langfuse/otel");
    const publicKey = import.meta.env.WXT_LANGFUSE_PUBLIC_KEY || "";
    const secretKey = import.meta.env.WXT_LANGFUSE_SECRET_KEY || "";
    const baseUrl =
      import.meta.env.WXT_LANGFUSE_BASEURL || "https://cloud.langfuse.com";

    spanProcessorInstance = new LangfuseSpanProcessor({
      publicKey,
      secretKey,
      baseUrl,
    });
  }
  return spanProcessorInstance as { forceFlush: () => Promise<void> };
}

export async function updateObservation(data: {
  input?: unknown;
  output?: unknown;
  level?: "DEFAULT" | "DEBUG" | "WARNING" | "ERROR";
}): Promise<void> {
  if (!DEBUG) return;

  const { updateActiveObservation } = await import("@langfuse/tracing");

  updateActiveObservation(data);
}

export async function updateTrace(data: {
  name?: string;
  input?: unknown;
  output?: unknown;
}): Promise<void> {
  if (!DEBUG) return;

  const { updateActiveTrace } = await import("@langfuse/tracing");

  updateActiveTrace(data);
}

export async function endActiveSpan(): Promise<void> {
  if (!DEBUG) return;

  const { trace } = await import("@opentelemetry/api");

  trace.getActiveSpan()?.end();
}

export async function flushSpanProcessor(): Promise<void> {
  if (!DEBUG) return;

  const processor = await getSpanProcessor();
  await processor.forceFlush();
}

export async function initializeTracerProvider(): Promise<void> {
  if (!DEBUG) return;

  const { WebTracerProvider } = await import("@opentelemetry/sdk-trace-web");
  const processor = await getSpanProcessor();

  const tracerProvider = new WebTracerProvider({
    spanProcessors: [processor as SpanProcessor],
  });

  tracerProvider.register();
}
