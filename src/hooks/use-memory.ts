import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoriesStore } from "@/lib/stores/memories";

export const useMemoryActions = () => {
  return useMemoriesStore(
    useShallow((state) => ({
      addEntry: state.addEntry,
      updateEntry: state.updateEntry,
      deleteEntry: state.deleteEntry,
      getEntryById: state.getEntryById,
      searchEntries: state.searchEntries,
      getEntriesByCategory: state.getEntriesByCategory,
      getEntriesByTags: state.getEntriesByTags,
      exportToCSV: state.exportToCSV,
      importFromCSV: state.importFromCSV,
      downloadCSVTemplate: state.downloadCSVTemplate,
    })),
  );
};

export const useMemoryEntry = (id: string | null) =>
  useMemoriesStore((state) =>
    id ? state.entries.find((e) => e.id === id) : undefined,
  );

export const useSearchMemory = (query: string) => {
  const entries = useMemoriesStore((state) => state.entries);

  return useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
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
  return useMemoriesStore(
    useShallow((state) => {
      const memoryCount = state.entries.length;
      const totalAutofills = state.entries.reduce(
        (sum, entry) => sum + entry.metadata.usageCount,
        0,
      );
      return { memoryCount, totalAutofills };
    }),
  );
};

export const useTopMemories = (limit = 10) => {
  const entries = useMemoriesStore((state) => state.entries);

  return useMemo(() => {
    return [...entries]
      .sort((a, b) => b.metadata.usageCount - a.metadata.usageCount)
      .slice(0, limit);
  }, [entries, limit]);
};
