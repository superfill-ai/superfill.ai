import {
  AI_PROVIDERS,
  type AIProvider,
  getProviderConfig,
  type ProviderConfig,
} from "./providers/registry";
import { getKeyVault } from "./security/key-vault";

export type { AIProvider, ProviderConfig };

export interface ProviderOption {
  value: AIProvider;
  label: string;
  description?: string;
  available: boolean;
  requiresApiKey: boolean;
}

export async function getProviderOptions(): Promise<ProviderOption[]> {
  const keyVault = getKeyVault();
  const keyStatuses = await Promise.all(
    AI_PROVIDERS.map(async (provider) => ({
      provider,
      hasKey: (await keyVault.getKey(provider)) !== null,
    })),
  );

  return AI_PROVIDERS.map((provider) => {
    const config = getProviderConfig(provider);
    const hasKey =
      keyStatuses.find((s) => s.provider === provider)?.hasKey ?? false;

    return {
      value: provider,
      label: config.name,
      description: config.description,
      available: config.requiresApiKey ? hasKey : true,
      requiresApiKey: config.requiresApiKey,
    };
  });
}

export async function getAvailableProviders(): Promise<ProviderOption[]> {
  const providers = await getProviderOptions();
  return providers.filter((p) => p.available);
}

export async function isProviderAvailable(
  provider: AIProvider,
): Promise<boolean> {
  const keyVault = getKeyVault();
  const key = await keyVault.getKey(provider);
  return key !== null;
}

export async function getFirstAvailableProvider(): Promise<AIProvider | null> {
  const providers = await getAvailableProviders();
  return providers.length > 0 ? providers[0].value : null;
}
