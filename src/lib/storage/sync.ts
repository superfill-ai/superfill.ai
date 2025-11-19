import type { SyncState } from "@/types/memory";

export const syncStateAndSettings = storage.defineItem<SyncState>(
  "local:settings:sync-state",
  {
    fallback: {
      lastSync: new Date().toISOString(),
      conflictResolution: "newest",
      status: "pending",
    },
    version: 1,
  },
);
