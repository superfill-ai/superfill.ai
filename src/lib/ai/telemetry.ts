import type { TelemetryIntegration } from "ai";
import { bindTelemetryIntegration } from "ai";
import { createLogger } from "@/lib/logger";

const logger = createLogger("ai:telemetry");

const LANGFUSE_PUBLIC_KEY = import.meta.env.WXT_LANGFUSE_PUBLIC_KEY as
  | string
  | undefined;
const LANGFUSE_SECRET_KEY = import.meta.env.WXT_LANGFUSE_SECRET_KEY as
  | string
  | undefined;
const LANGFUSE_BASEURL =
  (import.meta.env.WXT_LANGFUSE_BASEURL as string | undefined) ||
  "https://us.cloud.langfuse.com";

const langfuseEnabled = !!(LANGFUSE_PUBLIC_KEY && LANGFUSE_SECRET_KEY);

class DevTelemetryIntegration implements TelemetryIntegration {
  private startTime = 0;
  private startTimestamp = "";
  private inputData: unknown = undefined;

  async onStart(event: {
    model: { provider: string; modelId: string };
    system: unknown;
    prompt: unknown;
    messages: unknown;
  }) {
    this.startTime = performance.now();
    this.startTimestamp = new Date().toISOString();
    this.inputData = event.messages ?? event.prompt ?? event.system;
    logger.info(
      `AI call started | provider: ${event.model.provider} | model: ${event.model.modelId}`,
    );
  }

  async onFinish(event: {
    model: { provider: string; modelId: string };
    totalUsage: {
      inputTokens: number | undefined;
      outputTokens: number | undefined;
    };
    finishReason: string;
    functionId: string | undefined;
    text: string;
  }) {
    const duration = performance.now() - this.startTime;
    const inputTokens = event.totalUsage.inputTokens ?? 0;
    const outputTokens = event.totalUsage.outputTokens ?? 0;

    logger.info(
      `AI call completed | fn: ${event.functionId ?? "unknown"} | model: ${event.model.modelId} | tokens: ${inputTokens}+${outputTokens}=${inputTokens + outputTokens} | duration: ${(duration / 1000).toFixed(2)}s | finish: ${event.finishReason}`,
    );

    if (langfuseEnabled) {
      this.sendToLangfuse(event, duration).catch((err) =>
        logger.debug("Langfuse send failed:", err),
      );
    }
  }

  private async sendToLangfuse(
    event: {
      model: { provider: string; modelId: string };
      totalUsage: {
        inputTokens: number | undefined;
        outputTokens: number | undefined;
      };
      finishReason: string;
      functionId: string | undefined;
      text: string;
    },
    durationMs: number,
  ) {
    const traceId = crypto.randomUUID();
    const generationId = crypto.randomUUID();
    const endTime = new Date().toISOString();
    const startTime = this.startTimestamp || endTime;
    const input = this.inputData;
    const output = event.text;

    const batch = [
      {
        id: crypto.randomUUID(),
        type: "trace-create" as const,
        timestamp: startTime,
        body: {
          id: traceId,
          name: event.functionId ?? "ai-call",
          input,
          output,
          metadata: {
            provider: event.model.provider,
            model: event.model.modelId,
            source: "superfill-extension-dev",
          },
        },
      },
      {
        id: crypto.randomUUID(),
        type: "generation-create" as const,
        timestamp: startTime,
        body: {
          id: generationId,
          traceId,
          name: event.functionId ?? "ai-call",
          model: event.model.modelId,
          input,
          output,
          startTime,
          endTime,
          modelParameters: {
            provider: event.model.provider,
          },
          usage: {
            input: event.totalUsage.inputTokens ?? 0,
            output: event.totalUsage.outputTokens ?? 0,
            unit: "TOKENS",
          },
          metadata: {
            durationMs: Math.round(durationMs),
            finishReason: event.finishReason,
          },
        },
      },
    ];

    const credentials = btoa(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`);

    await fetch(`${LANGFUSE_BASEURL}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({ batch }),
    });

    logger.debug(`Langfuse trace sent: ${traceId}`);
  }
}

function devTelemetryIntegration(): TelemetryIntegration {
  return bindTelemetryIntegration(new DevTelemetryIntegration());
}

/**
 * Returns telemetry config to spread into generateText/streamText calls.
 * In production, returns an empty object (no-op when spread).
 * In dev, enables telemetry with console logging + optional Langfuse.
 */
export function getTelemetryConfig(functionId: string): {
  experimental_telemetry?: {
    isEnabled: boolean;
    functionId: string;
    integrations: TelemetryIntegration[];
  };
} {
  if (!import.meta.env.DEV) {
    return {};
  }

  return {
    experimental_telemetry: {
      isEnabled: true,
      functionId,
      integrations: [devTelemetryIntegration()],
    },
  };
}
