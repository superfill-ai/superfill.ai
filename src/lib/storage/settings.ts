import type { SyncState } from "@/types/memory";
import type { UserSettings } from "@/types/settings";
import { Theme } from "@/types/theme";
import { Trigger } from "@/types/trigger";

const theme = storage.defineItem<Theme>("local:settings:vite-ui-theme", {
  fallback: Theme.DEFAULT,
  version: 1,
});

const trigger = storage.defineItem<Trigger>("local:settings:trigger", {
  init: () => Trigger.POPUP,
  version: 1,
});

const userSettings = storage.defineItem<UserSettings>(
  "local:settings:user-settings",
  {
    fallback: {
      selectedProvider: "openai",
      autoFillEnabled: true,
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
  userSettings,
  syncState,
};
