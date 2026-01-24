import type { Theme } from "./theme";

/**
 * AI Provider identifiers
 */
export type AIProvider =
  | "openai"
  | "anthropic"
  | "groq"
  | "deepseek"
  | "gemini"
  | "ollama";

export interface EncryptedKey {
  encrypted: string;
  salt: string;
}

export interface AISettings {
  selectedProvider?: AIProvider;
  selectedModels?: Partial<Record<AIProvider, string>>;
  autoFillEnabled: boolean;
  autopilotMode: boolean;
  confidenceThreshold: number;
  inlineTriggerEnabled: boolean;
  contextMenuEnabled: boolean;
}

export interface UISettings {
  theme: Theme;
  onboardingCompleted: boolean;
  extensionVersion?: string;
  completedTours?: string[];
  lastTourCompletedAt?: string;
}

export interface ProviderOption {
  value: AIProvider;
  label: string;
  description?: string;
  available: boolean;
  requiresApiKey: boolean;
}
