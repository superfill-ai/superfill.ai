import { useQuery } from "@tanstack/react-query";
import { getModelService, type ModelInfo } from "@/lib/providers/model-service";
import type { AIProvider } from "@/lib/providers/registry";
import { keyVault } from "@/lib/security/key-vault";

export const useProviderModels = (provider: AIProvider) => {
  return useQuery({
    queryKey: ["models", provider],
    queryFn: async (): Promise<ModelInfo[]> => {
      const modelService = getModelService();
      const apiKey = await keyVault.getKey(provider);

      return modelService.getModels(provider, apiKey || undefined);
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useDefaultModel = (provider: AIProvider): string => {
  const defaults: Record<AIProvider, string> = {
    openai: "gpt-5-nano",
    anthropic: "claude-haiku-4-5-latest",
    groq: "llama-4-maverick",
    deepseek: "deepseek-v3",
    gemini: "gemini-2.5-flash",
    ollama: "llama3.2",
  };
  return defaults[provider];
};
