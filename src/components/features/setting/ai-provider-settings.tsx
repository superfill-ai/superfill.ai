import { CheckCircle2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  useDeleteApiKey,
  useProviderKeyStatuses,
  useSaveApiKeyWithModel,
} from "@/hooks/use-provider-keys";
import { getDefaultModel } from "@/lib/ai/model-factory";
import { getProviderOptions } from "@/lib/providers";
import {
  type AIProvider,
  getAllProviderConfigs,
} from "@/lib/providers/registry";
import { useSettingsStore } from "@/stores/settings";
import { ModelSelector } from "./model-selector";
import { ProviderKeyInput } from "./provider-key-input";

export const AiProviderSettings = () => {
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [providerOptions, setProviderOptions] = useState<
    ReturnType<typeof getProviderOptions> extends Promise<infer T> ? T : never
  >([]);
  const providerComboboxId = useId();
  const selectedProvider = useSettingsStore((state) => state.selectedProvider);
  const setSelectedProvider = useSettingsStore(
    (state) => state.setSelectedProvider,
  );
  const { data: keyStatuses } = useProviderKeyStatuses();
  const saveKeyWithModelMutation = useSaveApiKeyWithModel();
  const deleteKeyMutation = useDeleteApiKey();

  const allConfigs = getAllProviderConfigs();

  // biome-ignore lint/correctness/useExhaustiveDependencies: need to run when keyStatuses change
  useEffect(() => {
    const loadProviders = async () => {
      const options = await getProviderOptions();
      setProviderOptions(options);
    };
    loadProviders();
  }, [keyStatuses]);

  const handleSaveApiKey = async (provider: AIProvider) => {
    const key = providerKeys[provider];
    if (!key?.trim()) return;

    const defaultModel = getDefaultModel(provider);
    await saveKeyWithModelMutation.mutateAsync({ provider, key, defaultModel });
    setProviderKeys((prev) => ({ ...prev, [provider]: "" }));
  };

  const handleToggleShowKey = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleKeyChange = (provider: string, value: string) => {
    setProviderKeys((prev) => ({ ...prev, [provider]: value }));
  };

  const handleDeleteKey = async (provider: string) => {
    await deleteKeyMutation.mutateAsync(provider as AIProvider);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider</CardTitle>
        <CardDescription>Configure your AI provider API keys</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {allConfigs.map((config) => (
            <div key={config.id} className="flex gap-2">
              <ProviderKeyInput
                providerId={config.id}
                config={config}
                value={providerKeys[config.id] || ""}
                onChange={(value) => handleKeyChange(config.id, value)}
                onSave={() => handleSaveApiKey(config.id as AIProvider)}
                showKey={!!showKeys[config.id]}
                onToggleShow={() => handleToggleShowKey(config.id)}
                hasExistingKey={!!keyStatuses?.[config.id]}
                onDelete={() => handleDeleteKey(config.id)}
                isSelected={selectedProvider === config.id}
              />
              <ModelSelector
                provider={config.id as AIProvider}
                providerName={config.name}
                hasApiKey={!!keyStatuses?.[config.id]}
              />
            </div>
          ))}

          <Separator className="my-2" />
          <Field data-invalid={false}>
            <FieldLabel htmlFor={providerComboboxId}>
              Current Provider
            </FieldLabel>
            <Combobox
              id={providerComboboxId}
              value={selectedProvider}
              onValueChange={async (value) => {
                await setSelectedProvider(value as AIProvider);
              }}
              options={providerOptions.map((p) => ({
                value: p.value,
                label: p.label,
                disabled: !p.available,
                badge:
                  p.value === selectedProvider ? (
                    <Badge variant="default" className="ml-auto gap-1">
                      <CheckCircle2 className="size-3" />
                      Active
                    </Badge>
                  ) : !p.available ? (
                    <Badge variant="secondary" className="ml-auto">
                      No API Key
                    </Badge>
                  ) : undefined,
              }))}
              placeholder="Select provider..."
              searchPlaceholder="Search provider..."
              emptyText="No provider found."
              disabled={providerOptions.filter((p) => p.available).length === 0}
            />
            <FieldDescription>
              {providerOptions.filter((p) => p.available).length === 0
                ? "Please add at least one API key to select a provider"
                : "Choose which AI provider to use for form filling"}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};
