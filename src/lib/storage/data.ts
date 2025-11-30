import type { FillSession, MemoryEntry } from "@/types/memory";

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

export const dataStorage = {
  memories,
  fillSessions,
};
