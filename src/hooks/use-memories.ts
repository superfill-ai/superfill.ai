import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { storage } from "@/lib/storage";
import {
  addEntries as addEntriesHelper,
  addEntry as addEntryHelper,
  deleteEntry as deleteEntryHelper,
  downloadCSVTemplate as downloadCSVTemplateHelper,
  exportToCSV as exportToCSVHelper,
  importFromCSV as importFromCSVHelper,
  updateEntry as updateEntryHelper,
} from "@/lib/storage/memories";
import type { MemoryEntry } from "@/types/memory";

type CreateMemoryEntry = Omit<MemoryEntry, "id" | "metadata">;
type UpdateMemoryEntry = Partial<Omit<MemoryEntry, "id" | "metadata">>;

const MEMORIES_QUERY_KEY = ["memories"];

export const useMemories = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: MEMORIES_QUERY_KEY,
    queryFn: async () => {
      return await storage.memories.getValue();
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  useMemo(() => {
    const unwatch = storage.memories.watch((newMemories) => {
      if (newMemories !== null) {
        queryClient.setQueryData(MEMORIES_QUERY_KEY, newMemories);
      }
    });

    return () => unwatch();
  }, [queryClient]);

  return {
    entries: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    isError: query.isError,
  };
};

export const useMemoryMutations = () => {
  const queryClient = useQueryClient();

  const addEntry = useMutation({
    mutationFn: async (entry: CreateMemoryEntry) => {
      return await addEntryHelper(entry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
    },
  });

  const addEntries = useMutation({
    mutationFn: async (entries: CreateMemoryEntry[]) => {
      return await addEntriesHelper(entries);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateMemoryEntry;
    }) => {
      return await updateEntryHelper(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      return await deleteEntryHelper(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
    },
  });

  const importFromCSV = useMutation({
    mutationFn: async (csvContent: string) => {
      return await importFromCSVHelper(csvContent);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
    },
  });

  return {
    addEntry,
    addEntries,
    updateEntry,
    deleteEntry,
    importFromCSV,
  };
};

export const useMemoryEntry = (id: string | null) => {
  const { entries } = useMemories();

  return useMemo(() => {
    return id ? entries.find((e) => e.id === id) : undefined;
  }, [entries, id]);
};

export const useSearchMemories = (query: string) => {
  const { entries } = useMemories();

  return useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return entries;

    return entries.filter((entry) => {
      return (
        entry.answer.toLowerCase().includes(normalizedQuery) ||
        entry.question?.toLowerCase().includes(normalizedQuery) ||
        entry.category.toLowerCase().includes(normalizedQuery) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [entries, query]);
};

export const useMemoryStats = () => {
  const { entries } = useMemories();

  return useMemo(() => {
    const memoryCount = entries.length;
    return { memoryCount };
  }, [entries]);
};

export const useTopUsedTags = (
  topN: number,
): Array<{ tag: string; count: number }> => {
  const { entries } = useMemories();

  return useMemo(() => {
    const tagCountMap: Record<string, number> = {};

    entries.forEach((entry) => {
      entry.tags.forEach((tag) => {
        tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
      });
    });

    const sortedTags = Object.entries(tagCountMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([tag, count]) => ({ tag, count }));

    return sortedTags;
  }, [entries, topN]);
};

export const useMemoriesByCategory = (category: string) => {
  const { entries } = useMemories();

  return useMemo(() => {
    return entries.filter((entry) => entry.category === category);
  }, [entries, category]);
};

export const useMemoriesByTags = (tags: string[]) => {
  const { entries } = useMemories();

  return useMemo(() => {
    return entries.filter((entry) =>
      tags.some((tag) => entry.tags.includes(tag)),
    );
  }, [entries, tags]);
};

export const csvUtils = {
  exportToCSV: exportToCSVHelper,
  downloadCSVTemplate: downloadCSVTemplateHelper,
};
