import type { SyncState } from "@/types/memory";
import type { AISettings } from "@/types/settings";
import { Theme } from "@/types/theme";
import { Trigger } from "@/types/trigger";

const theme = storage.defineItem<Theme>("local:settings:ui-theme", {
  fallback: Theme.DEFAULT,
  version: 1,
});

const trigger = storage.defineItem<Trigger>("local:settings:trigger", {
  init: () => Trigger.POPUP,
  version: 1,
});

const aiSettings = storage.defineItem<AISettings>(
  "local:settings:ai-settings",
  {
    fallback: {
      autoFillEnabled: true,
      autopilotMode: false,
      confidenceThreshold: 0.6,
    },
    version: 1,
  },
);

const syncState = storage.defineItem<SyncState>("local:settings:sync-state", {
  fallback: {
    lastSync: new Date().toISOString(),
    conflictResolution: "newest",
    status: "pending",
  },
  version: 1,
});

export const settingsStorage = {
  theme,
  trigger,
  aiSettings,
  syncState,
};
