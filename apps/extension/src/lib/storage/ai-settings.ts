import type { AISettings } from "@superfill/shared/types/settings";

export const aiSettingsFallback: AISettings = {
  autoFillEnabled: true,
  autopilotMode: false,
  confidenceThreshold: 0.6,
  inlineTriggerEnabled: false,
  contextMenuEnabled: true,
};

export const aiSettings = storage.defineItem<AISettings>(
  "local:settings:ai-settings",
  {
    fallback: aiSettingsFallback,
    version: 2,
  },
);
