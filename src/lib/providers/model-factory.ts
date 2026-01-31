import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { ollama } from "ai-sdk-ollama";
import type { AIProvider } from "@/lib/providers/registry";

const OPENAI_COMPATIBLE_PROVIDERS = {
  openai: {
    baseURL: undefined,
    defaultModel: "gpt-5-nano",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-4-maverick",
  },
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-v3",
  },
} as const;

export const getAIModel = (
  provider: AIProvider,
  apiKey: string,
  model?: string,
) => {
  if (provider === "anthropic") {
    const anthropic = createAnthropic({
      apiKey,
      headers: {
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    return anthropic(model || "claude-haiku-4-5-latest");
  }

  if (provider === "gemini") {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(model || "gemini-2.5-flash");
  }

  if (provider === "ollama") {
    return ollama(model || "llama3.2");
  }

  if (provider in OPENAI_COMPATIBLE_PROVIDERS) {
    const config =
      OPENAI_COMPATIBLE_PROVIDERS[
        provider as keyof typeof OPENAI_COMPATIBLE_PROVIDERS
      ];
    const openaiCompatible = createOpenAI({
      apiKey,
      ...(config.baseURL && { baseURL: config.baseURL }),
    });
    return openaiCompatible(model || config.defaultModel);
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
};

const defaults: Record<AIProvider, string> = {
  openai: "gpt-5-nano",
  anthropic: "claude-haiku-4-5-20251001",
  groq: "openai/gpt-oss-20b",
  deepseek: "deepseek-chat",
  gemini: "models/gemini-2.5-flash",
  ollama: "llama3.2",
};

export const getDefaultModel = (provider: AIProvider): string => {
  return defaults[provider];
};
