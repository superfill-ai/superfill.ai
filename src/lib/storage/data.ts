import type { FillSession } from "@/types/memory";

export interface CaptureSettings {
  enabled: boolean;
  blockedDomains: string[];
  neverAskSites: string[];
}

// Note: memories have been migrated to RxDB (see src/lib/rxdb)

export const fillSessionsFallback: FillSession[] = [];

const fillSessions = storage.defineItem<FillSession[]>(
  "local:data:fill-sessions",
  {
    fallback: fillSessionsFallback,
    version: 1,
  },
);

export const captureSettingsFallback: CaptureSettings = {
  enabled: true,
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

export const dataStorage = {
  fillSessions,
  captureSettings,
};
