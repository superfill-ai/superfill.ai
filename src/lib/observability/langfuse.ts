import { LangfuseSpanProcessor } from "@langfuse/otel";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";

const publicKey = import.meta.env.WXT_LANGFUSE_PUBLIC_KEY || "";
const secretKey = import.meta.env.WXT_LANGFUSE_SECRET_KEY || "";
const baseUrl = import.meta.env.WXT_LANGFUSE_BASEURL || "https://cloud.langfuse.com";

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  publicKey,
  secretKey,
  baseUrl,
});

export const tracerProvider = new WebTracerProvider({
  spanProcessors: [langfuseSpanProcessor],
});
