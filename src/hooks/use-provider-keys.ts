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
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveApiKeyWithModel() {
  const queryClient = useQueryClient();
  const setApiKey = useSettingsStore((state) => state.setApiKey);
  const setSelectedProvider = useSettingsStore(
    (state) => state.setSelectedProvider,
  );
  const setSelectedModel = useSettingsStore((state) => state.setSelectedModel);

  return useMutation({
    mutationFn: async ({
      provider,
      key,
      defaultModel,
    }: {
      provider: AIProvider;
      key: string;
      defaultModel: string;
    }) => {
      const config = getProviderConfig(provider);

      if (config.requiresApiKey && !validateProviderKey(provider, key)) {
        throw new Error(`Invalid ${config.name} API key format`);
      }

      await setApiKey(provider, key);
      await setSelectedModel(provider, defaultModel);

      return { provider, key, defaultModel };
    },
    onSuccess: async ({ provider }) => {
      const config = getProviderConfig(provider);

      await queryClient.invalidateQueries({
        queryKey: PROVIDER_KEYS_QUERY_KEY,
      });

      await queryClient.invalidateQueries({ queryKey: ["models", provider] });
      await setSelectedProvider(provider);

      toast.success(`${config.name} API key saved successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save API key");
    },
  });
}

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

      await queryClient.invalidateQueries({
        queryKey: PROVIDER_KEYS_QUERY_KEY,
      });

      await queryClient.invalidateQueries({ queryKey: ["models", provider] });

      toast.success(`${config.name} API key deleted successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete API key");
    },
  });
}
