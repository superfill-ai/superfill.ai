import { defineProxyService } from "@webext-core/proxy-service";
import type { AIProvider } from "./registry";

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  description?: string;
}

interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface GeminiModel {
  name: string;
  supportedGenerationMethods: string[];
  displayName: string;
}

interface AnthropicModel {
  id: string;
  display_name: string;
  type: string;
}

interface DeepSeekModel {
  id: string;
  object: string;
  name: string;
}

const DEFAULT_MODELS: Record<AIProvider, ModelInfo[]> = {
  openai: [
    { id: "gpt-5-nano", name: "GPT-5 Nano" },
  ],
  anthropic: [
    {
      id: "claude-haiku-4-5-20251001",
      name: "Claude Haiku 4.5",
    },
  ],
  groq: [
    {
      id: "llama-4-maverick",
      name: "Llama 4 Maverick 400B",
    },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat", },
  ],
  gemini: [
    {
      id: "models/gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
    },
  ],
};

class ModelService {
  async getModels(provider: AIProvider, apiKey?: string): Promise<ModelInfo[]> {
    try {
      if (!apiKey) {
        return DEFAULT_MODELS[provider] || [];
      }

      switch (provider) {
        case "openai":
          return await this.fetchOpenAIModels(apiKey);
        case "anthropic":
          return await this.fetchAnthropicModels(apiKey);
        case "groq":
          return await this.fetchGroqModels(apiKey);
        case "deepseek":
          return await this.fetchDeepSeekModels(apiKey);
        case "gemini":
          return await this.fetchGeminiModels(apiKey);
        default:
          return DEFAULT_MODELS[provider] || [];
      }
    } catch (error) {
      console.error(`Failed to fetch models for ${provider}:`, error);
      return DEFAULT_MODELS[provider] || [];
    }
  }

  private async fetchOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        return DEFAULT_MODELS.openai;
      }

      const data = (await response.json()) as { data: OpenAIModel[] };
      const models = data.data
        .filter((m: OpenAIModel) => m.id.startsWith("gpt-"))
        .map((m: OpenAIModel) => ({
          id: m.id,
          name: m.id
            .split("-")
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
        }));

      return models.length > 0 ? models : DEFAULT_MODELS.openai;
    } catch {
      return DEFAULT_MODELS.openai;
    }
  }

  private async fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
    try {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });

      if (!response.ok) {
        return DEFAULT_MODELS.anthropic;
      }

      const data = (await response.json()) as { data: AnthropicModel[] };
      const models = data.data.filter((m) => m.type === "model").map((m) => ({
        id: m.id,
        name: m.display_name,
      }));

      return models.length > 0 ? models : DEFAULT_MODELS.anthropic;
    } catch {
      return DEFAULT_MODELS.anthropic;
    }
  }

  private async fetchGroqModels(apiKey: string): Promise<ModelInfo[]> {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        return DEFAULT_MODELS.groq;
      }

      const data = (await response.json()) as { data: OpenAIModel[] };
      const models = data.data
        .filter(
          (m: OpenAIModel) =>
            !m.id.includes("whisper") &&
            !m.id.includes("distil") &&
            !m.id.includes("guard"),
        )
        .map((m: OpenAIModel) => ({
          id: m.id,
          name: m.id
            .split("-")
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
        }));

      return models.length > 0 ? models : DEFAULT_MODELS.groq;
    } catch {
      return DEFAULT_MODELS.groq;
    }
  }

  private async fetchDeepSeekModels(apiKey: string): Promise<ModelInfo[]> {
    try {
      const response = await fetch("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        return DEFAULT_MODELS.deepseek;
      }

      const data = (await response.json()) as { data: DeepSeekModel[] };
      const models = data.data.map((m) => ({
        id: m.id,
        name: m.id
          .split("-")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
      }));

      return models.length > 0 ? models : DEFAULT_MODELS.deepseek;
    } catch {
      return DEFAULT_MODELS.deepseek;
    }
  }

  private async fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1/models",
        {
          headers: {
            "x-goog-api-key": apiKey,
          },
        },
      );

      if (!response.ok) {
        return DEFAULT_MODELS.gemini;
      }

      const data = (await response.json()) as { models: GeminiModel[] };
      const models = data.models
        .filter(
          (m: GeminiModel) =>
            m.name.includes("gemini") &&
            m.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((m: GeminiModel) => {
          return {
            id: m.name,
            name: m.displayName,
          };
        });

      return models.length > 0 ? models : DEFAULT_MODELS.gemini;
    } catch {
      return DEFAULT_MODELS.gemini;
    }
  }

  getDefaultModel(provider: AIProvider): string {
    const defaults: Record<AIProvider, string> = {
      openai: "gpt-5-nano",
      anthropic: "claude-haiku-4-5-20251001",
      groq: "openai/gpt-oss-20b",
      deepseek: "deepseek-chat",
      gemini: "models/gemini-2.5-flash",
    };
    return defaults[provider];
  }
}

export const [registerModelService, getModelService] = defineProxyService(
  "ModelService",
  () => new ModelService(),
);
