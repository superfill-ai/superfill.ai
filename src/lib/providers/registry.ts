/**
 * Provider Registry - Single source of truth for AI provider configurations
 *
 * To add a new provider:
 * 1. Add entry to PROVIDER_REGISTRY with configuration
 * 2. That's it! The UI and types will automatically update
 */

export interface ProviderConfig {
  id: string;
  name: string;
  keyPrefix: string;
  keyPlaceholder: string;
  description?: string;
  requiresApiKey: boolean;
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
    validateKey: (key: string) => key.startsWith("sk-") && key.length > 20,
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-...",
    description: "Claude 4.1 models (Opus, Sonnet, Haiku)",
    requiresApiKey: true,
    validateKey: (key: string) => key.startsWith("sk-ant-") && key.length > 20,
  },
  groq: {
    id: "groq",
    name: "Groq",
    keyPrefix: "gsk_",
    keyPlaceholder: "gsk_...",
    description: "Ultra-fast inference with Llama and Mixtral",
    requiresApiKey: true,
    validateKey: (key: string) => key.startsWith("gsk_") && key.length > 20,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
    description: "DeepSeek models",
    requiresApiKey: true,
    validateKey: (key: string) => key.startsWith("sk-") && key.length > 20,
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    keyPrefix: "AIza",
    keyPlaceholder: "AIza...",
    description: "Google Gemini models with large context windows",
    requiresApiKey: true,
    validateKey: (key: string) => key.startsWith("AIza") && key.length > 20,
  },
  // ollama: {
  //   id: "ollama",
  //   name: "Ollama (Local)",
  //   keyPrefix: "",
  //   keyPlaceholder: "Not required for local",
  //   description: "Run models locally on your machine",
  //   requiresApiKey: false,
  //   validateKey: () => true,
  // },
} as const satisfies Record<string, ProviderConfig>;

export type AIProvider = keyof typeof PROVIDER_REGISTRY;

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
