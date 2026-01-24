import type {
  AIProvider,
  ProviderOption,
} from "@superfill/shared/types/settings";
import { getKeyVaultService } from "../security/key-vault-service";

export interface ProviderConfig {
  id: string;
  name: string;
  keyPrefix: string;
  keyPlaceholder: string;
  description?: string;
  requiresApiKey: boolean;
  apiKeyUrl?: string;
  validateKey?: (key: string) => boolean;
}

export const PROVIDER_REGISTRY = {
  openai: {
    id: "openai",
    name: "OpenAI",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
    description: "GPT-5, GPT-o models and more",
    requiresApiKey: true,
    apiKeyUrl: "https://platform.openai.com/api-keys",
    validateKey: (key: string) => key.startsWith("sk-") && key.length > 20,
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-...",
    description: "Claude 4.1 models (Opus, Sonnet, Haiku)",
    requiresApiKey: true,
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    validateKey: (key: string) => key.startsWith("sk-ant-") && key.length > 20,
  },
  groq: {
    id: "groq",
    name: "Groq",
    keyPrefix: "gsk_",
    keyPlaceholder: "gsk_...",
    description: "Ultra-fast inference with Llama and Mixtral",
    requiresApiKey: true,
    apiKeyUrl: "https://console.groq.com/keys",
    validateKey: (key: string) => key.startsWith("gsk_") && key.length > 20,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
    description: "DeepSeek models",
    requiresApiKey: true,
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    validateKey: (key: string) => key.startsWith("sk-") && key.length > 20,
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    keyPrefix: "AIza",
    keyPlaceholder: "AIza...",
    description: "Google Gemini models with large context windows",
    requiresApiKey: true,
    apiKeyUrl: "https://aistudio.google.com/app/api-keys",
    validateKey: (key: string) => key.startsWith("AIza") && key.length > 20,
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    keyPrefix: "",
    keyPlaceholder: "http://localhost:11434",
    description: "Run models locally on your machine",
    requiresApiKey: false,
    validateKey: () => true,
  },
} as const satisfies Record<string, ProviderConfig>;

// Re-export AIProvider from shared types
export type { AIProvider } from "@superfill/shared/types/settings";

export const AI_PROVIDERS = Object.keys(PROVIDER_REGISTRY) as AIProvider[];

export function getProviderConfig(provider: AIProvider): ProviderConfig {
  return PROVIDER_REGISTRY[provider];
}

export function getAllProviderConfigs(): ProviderConfig[] {
  return Object.values(PROVIDER_REGISTRY);
}

export function isValidProvider(provider: string): provider is AIProvider {
  return provider in PROVIDER_REGISTRY;
}

export function validateProviderKey(
  provider: AIProvider,
  key: string,
): boolean {
  const config = PROVIDER_REGISTRY[provider];
  if (!config.requiresApiKey) return true;
  if (!key || key.trim() === "") return false;
  return config.validateKey ? config.validateKey(key) : true;
}

export async function getProviderOptions(): Promise<ProviderOption[]> {
  const keyVaultService = getKeyVaultService();
  const keyStatuses = await Promise.all(
    AI_PROVIDERS.map(async (provider) => ({
      provider,
      hasKey: await keyVaultService.hasKey(provider),
    })),
  );

  return AI_PROVIDERS.map((provider) => {
    const config = getProviderConfig(provider);
    const hasKey =
      keyStatuses.find((s) => s.provider === provider)?.hasKey ?? false;

    return {
      value: provider,
      label: config.name,
      description: config.description,
      available: config.requiresApiKey ? hasKey : true,
      requiresApiKey: config.requiresApiKey,
    };
  });
}
