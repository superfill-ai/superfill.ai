import type { AIProvider } from "@/lib/providers/registry";
import type { Theme } from "./theme";

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
  contextMenuEnabled: boolean;
}

export interface UISettings {
  theme: Theme;
  onboardingCompleted: boolean;
  extensionVersion?: string;
  completedTours?: string[];
  lastTourCompletedAt?: string;
  rightClickGuideSnoozedUntil?: string;
  rightClickGuideDismissed?: boolean;
}

export interface ProviderOption {
  value: AIProvider;
  label: string;
  description?: string;
  available: boolean;
  requiresApiKey: boolean;
}
