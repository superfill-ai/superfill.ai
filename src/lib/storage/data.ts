import type { FillSession, FormMapping, MemoryEntry } from "@/types/memory";

export const memoriesFallback: MemoryEntry[] = [];

const memories = storage.defineItem<MemoryEntry[]>("local:data:memories", {
  fallback: memoriesFallback,
  version: 1,
});

export const formMappingsFallback: FormMapping[] = [];

const formMappings = storage.defineItem<FormMapping[]>(
  "local:data:form-mappings",
  {
    fallback: formMappingsFallback,
    version: 1,
  },
);

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
  formMappings,
  fillSessions,
};
