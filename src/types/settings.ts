import type { AIProvider } from "@/lib/providers/registry";
import type { Theme } from "./theme";
import type { Trigger } from "./trigger";

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
  cloudModelsEnabled: boolean;
}

export interface UISettings {
  theme: Theme;
  trigger: Trigger;
  onboardingCompleted: boolean;
}
