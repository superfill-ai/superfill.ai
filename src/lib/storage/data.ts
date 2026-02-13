import type { FillSession, MemoryEntry } from "@/types/memory";
import type { PendingDeletion } from "@/types/sync";

export interface CaptureSettings {
  enabled: boolean;
  blockedDomains: string[];
  neverAskSites: string[];
}

export const memoriesFallback: MemoryEntry[] = [];

const memories = storage.defineItem<MemoryEntry[]>("local:data:memories", {
  fallback: memoriesFallback,
  version: 1,
});

export const fillSessionsFallback: FillSession[] = [];

const fillSessions = storage.defineItem<FillSession[]>(
  "local:data:fill-sessions",
  {
    fallback: fillSessionsFallback,
    version: 1,
  },
);

export const captureSettingsFallback: CaptureSettings = {
  enabled: false,
  blockedDomains: [],
  neverAskSites: [],
};

const captureSettings = storage.defineItem<CaptureSettings>(
  "local:data:capture-settings",
  {
    fallback: captureSettingsFallback,
    version: 1,
  },
);

export const pendingDeletionsFallback: PendingDeletion[] = [];

const pendingDeletions = storage.defineItem<PendingDeletion[]>(
  "local:data:pending-deletions",
  {
    fallback: pendingDeletionsFallback,
    version: 1,
  },
);

export const dataStorage = {
  memories,
  fillSessions,
  captureSettings,
  pendingDeletions,
};
