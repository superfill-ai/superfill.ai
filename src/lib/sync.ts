import type { MemoryEntry } from "@/types/memory";

export function memoryEntryToSyncFormat(entry: MemoryEntry): {
  localId: string;
  question?: string;
  answer: string;
  category: string;
  tags: string[];
  confidence: number;
  embedding?: number[];
  metadata: {
    createdAt: number;
    updatedAt: number;
    source: string;
    usageCount: number;
    lastUsed?: number;
  };
  isDeleted: boolean;
  deletedAt?: number;
} {
  return {
    localId: entry.id,
    question: entry.question,
    answer: entry.answer,
    category: entry.category,
    tags: entry.tags,
    confidence: entry.confidence,
    embedding: entry.embedding,
    metadata: {
      createdAt: new Date(entry.metadata.createdAt).getTime(),
      updatedAt: new Date(entry.metadata.updatedAt).getTime(),
      source: entry.metadata.source,
      usageCount: entry.metadata.usageCount,
      lastUsed: entry.metadata.lastUsed
        ? new Date(entry.metadata.lastUsed).getTime()
        : undefined,
    },
    isDeleted: false,
  };
}

export function syncFormatToMemoryEntry(
  syncEntry: {
    localId: string;
    question?: string;
    answer: string;
    category: string;
    tags: string[];
    confidence: number;
    embedding?: number[];
    metadata: {
      createdAt: number;
      updatedAt: number;
      source: string;
      usageCount: number;
      lastUsed?: number;
    };
    isDeleted: boolean;
    deletedAt?: number;
  },
  syncId?: string,
): MemoryEntry {
  return {
    id: syncEntry.localId,
    syncId: syncId,
    question: syncEntry.question,
    answer: syncEntry.answer,
    category: syncEntry.category,
    tags: syncEntry.tags,
    confidence: syncEntry.confidence,
    embedding: syncEntry.embedding,
    metadata: {
      createdAt: new Date(syncEntry.metadata.createdAt).toISOString(),
      updatedAt: new Date(syncEntry.metadata.updatedAt).toISOString(),
      source: syncEntry.metadata.source as "manual" | "import",
      usageCount: syncEntry.metadata.usageCount,
      lastUsed: syncEntry.metadata.lastUsed
        ? new Date(syncEntry.metadata.lastUsed).toISOString()
        : undefined,
    },
  };
}
