import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AIProvider } from "@/lib/providers/registry";
import {
  AI_PROVIDERS,
  getProviderConfig,
  validateProviderKey,
} from "@/lib/providers/registry";
import { getKeyVaultService } from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import type { AISettings } from "@/types/settings";

export const PROVIDER_KEYS_QUERY_KEY = ["provider-keys"] as const;

export function useProviderKeyStatuses() {
  return useQuery({
    queryKey: PROVIDER_KEYS_QUERY_KEY,
    queryFn: async () => {
      const statuses: Record<string, boolean> = {};
      const keyVaultService = getKeyVaultService();

      await Promise.all(
        AI_PROVIDERS.map(async (provider) => {
          const hasKey = await keyVaultService.hasKey(provider);
          statuses[provider] = hasKey;
        }),
      );

      return statuses;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveApiKeyWithModel() {
  const queryClient = useQueryClient();

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

      const keyVaultService = getKeyVaultService();

      if (await keyVaultService.validateKey(provider, key)) {
        await keyVaultService.storeKey(provider, key);

        const currentSettings = await storage.aiSettings.getValue();
        const updatedModels = {
          ...currentSettings.selectedModels,
          [provider]: defaultModel,
        };
        const updatedSettings: AISettings = {
          ...currentSettings,
          selectedProvider: provider,
          selectedModels: updatedModels,
        };

        await storage.aiSettings.setValue(updatedSettings);
      } else {
        throw new Error("Invalid API key");
      }

      return { provider, key, defaultModel };
    },
    onSuccess: async ({ provider }) => {
      const config = getProviderConfig(provider);

      await queryClient.invalidateQueries({
        queryKey: PROVIDER_KEYS_QUERY_KEY,
      });

      await queryClient.invalidateQueries({ queryKey: ["models", provider] });

      toast.success(`${config.name} API key saved successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save API key");
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: AIProvider) => {
      const keyVaultService = getKeyVaultService();
      await keyVaultService.deleteKey(provider);
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
