import type { MemoryEntry } from "@superfill/shared/types/memory";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { storageClient } from "../lib/storage";

type CreateMemoryEntry = Omit<MemoryEntry, "id" | "metadata">;
type UpdateMemoryEntry = Partial<Omit<MemoryEntry, "id" | "metadata">>;

const MEMORIES_QUERY_KEY = ["memories"];

export const useMemories = () => {
  const query = useQuery({
    queryKey: MEMORIES_QUERY_KEY,
    queryFn: async () => {
      return await storageClient.getMemories();
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

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
      const newEntry: MemoryEntry = {
        ...entry,
        id: uuidv4(),
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: "manual",
        },
      };
      await storageClient.addMemory(newEntry);
      return newEntry;
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
      await storageClient.updateMemory(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      await storageClient.deleteMemory(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
    },
  });

  return {
    addEntry,
    updateEntry,
    deleteEntry,
  };
};
