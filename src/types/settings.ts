import type { AIProvider } from "@/lib/providers/registry";
import type { Theme } from "./theme";
import type { Trigger } from "./trigger";

export interface EncryptedKey {
  encrypted: string;
  salt: string;
}

export interface UserSettings {
  selectedProvider: AIProvider;
  selectedModels?: Partial<Record<AIProvider, string>>;
  autoFillEnabled: boolean;
  autopilotMode: boolean;
  confidenceThreshold: number;
}

export interface AllSettings {
  theme: Theme;
  trigger: Trigger;
  userSettings: UserSettings;
}
