import type { AISettings } from "@/types/settings";

export const aiSettingsFallback: AISettings = {
  autoFillEnabled: true,
  autopilotMode: false,
  confidenceThreshold: 0.6,
};

export const aiSettings = storage.defineItem<AISettings>(
  "local:settings:ai-settings",
  {
    fallback: aiSettingsFallback,
    version: 2,
  },
);
