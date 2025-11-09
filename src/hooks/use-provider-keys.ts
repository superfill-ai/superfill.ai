import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AIProvider } from "@/lib/providers/registry";
import {
  AI_PROVIDERS,
  getProviderConfig,
  validateProviderKey,
} from "@/lib/providers/registry";
import { useSettingsStore } from "@/stores/settings";

export const PROVIDER_KEYS_QUERY_KEY = ["provider-keys"] as const;

/**
 * Hook to fetch the status of all provider API keys
 */
export function useProviderKeyStatuses() {
  const getApiKey = useSettingsStore((state) => state.getApiKey);

  return useQuery({
    queryKey: PROVIDER_KEYS_QUERY_KEY,
    queryFn: async () => {
      const statuses: Record<string, boolean> = {};

      await Promise.all(
        AI_PROVIDERS.map(async (provider) => {
          const key = await getApiKey(provider);
          statuses[provider] = key !== null;
        }),
      );

      return statuses;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to save a single API key
 */
export function useSaveApiKey() {
  const queryClient = useQueryClient();
  const setApiKey = useSettingsStore((state) => state.setApiKey);
  const setSelectedProvider = useSettingsStore(
    (state) => state.setSelectedProvider,
  );

  return useMutation({
    mutationFn: async ({
      provider,
      key,
    }: {
      provider: AIProvider;
      key: string;
    }) => {
      const config = getProviderConfig(provider);

      // Client-side validation
      if (config.requiresApiKey && !validateProviderKey(provider, key)) {
        throw new Error(`Invalid ${config.name} API key format`);
      }

      // Store the key (includes server-side validation)
      await setApiKey(provider, key);

      return { provider, key };
    },
    onSuccess: async ({ provider }) => {
      const config = getProviderConfig(provider);

      // Invalidate the query to refresh the UI
      await queryClient.invalidateQueries({
        queryKey: PROVIDER_KEYS_QUERY_KEY,
      });

      // Set as selected provider
      await setSelectedProvider(provider);

      toast.success(`${config.name} API key saved successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save API key");
    },
  });
}

/**
 * Hook to delete an API key
 */
export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  const deleteApiKey = useSettingsStore((state) => state.deleteApiKey);

  return useMutation({
    mutationFn: async (provider: AIProvider) => {
      await deleteApiKey(provider);
      return provider;
    },
    onSuccess: async (provider) => {
      const config = getProviderConfig(provider);

      // Invalidate the query to refresh the UI
      await queryClient.invalidateQueries({
        queryKey: PROVIDER_KEYS_QUERY_KEY,
      });

      toast.success(`${config.name} API key deleted successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete API key");
    },
  });
}

/**
 * Hook to save multiple API keys at once
 */
export function useSaveMultipleApiKeys() {
  const queryClient = useQueryClient();
  const saveApiKey = useSaveApiKey();

  return useMutation({
    mutationFn: async (keys: Record<string, string>) => {
      const entries = Object.entries(keys).filter(
        ([_, key]) => key.trim() !== "",
      );

      if (entries.length === 0) {
        throw new Error("Please enter at least one API key");
      }

      // Save all keys
      const results = await Promise.allSettled(
        entries.map(([provider, key]) =>
          saveApiKey.mutateAsync({ provider: provider as AIProvider, key }),
        ),
      );

      // Check for failures
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        const firstError = (failures[0] as PromiseRejectedResult).reason;
        throw firstError;
      }

      return entries.map(([provider]) => provider as AIProvider);
    },
    onSuccess: async (savedProviders) => {
      await queryClient.invalidateQueries({
        queryKey: PROVIDER_KEYS_QUERY_KEY,
      });

      if (savedProviders.length === 1) {
        const config = getProviderConfig(savedProviders[0]);
        toast.success(`${config.name} API key saved successfully`);
      } else {
        toast.success(`${savedProviders.length} API keys saved successfully`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save API keys");
    },
  });
}
