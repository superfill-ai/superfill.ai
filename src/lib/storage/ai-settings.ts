import type { AISettings } from "@/types/settings";

export const aiSettings = storage.defineItem<AISettings>(
  "local:settings:ai-settings",
  {
    fallback: {
      autoFillEnabled: true,
      autopilotMode: false,
      confidenceThreshold: 0.6,
    },
    version: 2,
  },
);
