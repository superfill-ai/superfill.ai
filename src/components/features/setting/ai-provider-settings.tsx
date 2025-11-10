import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  useDeleteApiKey,
  useProviderKeyStatuses,
  useSaveMultipleApiKeys,
} from "@/hooks/use-provider-keys";
import { getProviderOptions } from "@/lib/providers";
import {
  type AIProvider,
  getAllProviderConfigs,
} from "@/lib/providers/registry";
import { useSettingsStore } from "@/stores/settings";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
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
  const saveKeysMutation = useSaveMultipleApiKeys();
  const deleteKeyMutation = useDeleteApiKey();

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to refetch when keyStatuses change
  useEffect(() => {
    const loadProviders = async () => {
      const options = await getProviderOptions();
      setProviderOptions(options);
    };
    loadProviders();
  }, [keyStatuses]);

  const handleSaveApiKeys = async () => {
    await saveKeysMutation.mutateAsync(providerKeys);
    setProviderKeys({});
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

  const allConfigs = getAllProviderConfigs();

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

          <Button
            onClick={handleSaveApiKeys}
            className="w-full"
            disabled={saveKeysMutation.isPending}
          >
            {saveKeysMutation.isPending ? "Saving..." : "Save API Keys"}
          </Button>

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
