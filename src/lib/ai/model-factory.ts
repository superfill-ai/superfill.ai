import type { AIProvider } from "@/lib/providers/registry";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

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
  // ollama: {
  //   baseURL: "http://localhost:11434/v1",
  //   defaultModel: "llama3.2",
  // },
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

  const config = OPENAI_COMPATIBLE_PROVIDERS[provider];

  if (config) {
    const openaiCompatible = createOpenAI({
      // apiKey: provider === "ollama" ? "ollama" : apiKey,
      apiKey,
      ...(config.baseURL && { baseURL: config.baseURL }),
    });
    return openaiCompatible(model || config.defaultModel);
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
};
