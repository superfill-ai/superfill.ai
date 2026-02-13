import { CheckCircle2, Cloud, Info } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useCloudUsageStatus } from "@/hooks/use-cloud-usage";
import {
  useDeleteApiKey,
  useProviderKeyStatuses,
  useSaveApiKeyWithModel,
} from "@/hooks/use-provider-keys";
import { getDefaultModel } from "@/lib/providers/model-factory";
import {
  type AIProvider,
  getAllProviderConfigs,
  getProviderOptions,
} from "@/lib/providers/registry";
import { storage } from "@/lib/storage";
import type { AISettings } from "@/types/settings";
import { ModelSelector } from "./model-selector";
import { ProviderKeyInput } from "./provider-key-input";

export const AiProviderSettings = () => {
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [providerOptions, setProviderOptions] = useState<
    ReturnType<typeof getProviderOptions> extends Promise<infer T> ? T : never
  >([]);
  const [selectedProvider, setSelectedProvider] = useState<
    AIProvider | undefined
  >();
  const [cloudModelsEnabled, setCloudModelsEnabled] = useState(false);
  const providerComboboxId = useId();
  const { data: keyStatuses } = useProviderKeyStatuses();
  const saveKeyWithModelMutation = useSaveApiKeyWithModel();
  const deleteKeyMutation = useDeleteApiKey();
  const allConfigs = getAllProviderConfigs();
  const { isAuthenticated, pendingApproval } = useAuth();
  const cloudUsage = useCloudUsageStatus();

  useEffect(() => {
    const fetchAndWatch = async () => {
      const settings = await storage.aiSettings.getValue();
      setSelectedProvider(settings.selectedProvider);
      setCloudModelsEnabled(settings.cloudModelsEnabled);
    };

    fetchAndWatch();

    const unsubscribe = storage.aiSettings.watch((newSettings) => {
      if (newSettings) {
        setSelectedProvider(newSettings.selectedProvider);
        setCloudModelsEnabled(newSettings.cloudModelsEnabled);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

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
    const apiKey = provider === "ollama" ? "ollama-local" : key;

    if (provider !== "ollama" && !key?.trim()) return;

    const defaultModel = getDefaultModel(provider);

    await saveKeyWithModelMutation.mutateAsync({
      provider,
      key: apiKey,
      defaultModel,
    });
    setProviderKeys((prev) => ({ ...prev, [provider]: "" }));
    setShowKeys((prev) => ({ ...prev, [provider]: false }));
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

  const handleCloudModelsToggle = async (enabled: boolean) => {
    if (enabled) {
      if (
        cloudUsage &&
        cloudUsage.remaining !== null &&
        cloudUsage.remaining === 0
      ) {
        return;
      }
    }

    const currentSettings = await storage.aiSettings.getValue();
    const updatedSettings: AISettings = {
      ...currentSettings,
      cloudModelsEnabled: enabled,
    };
    await storage.aiSettings.setValue(updatedSettings);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider</CardTitle>
        <CardDescription>
          Configure your AI provider API keys. Quality of autofill matches
          depends on the AI model used.{" "}
          <strong className="underline">
            Recommended to use the latest models available
          </strong>
        </CardDescription>
      </CardHeader>
      <CardContent data-tour="ai-provider">
        <FieldGroup>
          <Field data-invalid={false}>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <FieldLabel className="flex items-center gap-2">
                  <Cloud className="size-4" />
                  Cloud Models
                </FieldLabel>
                <FieldDescription>
                  Use Superfill's cloud-hosted AI models. No API keys required.{" "}
                  {pendingApproval
                    ? " (Pending approval)"
                    : !isAuthenticated
                      ? " (Requires sign-in)"
                      : ""}
                </FieldDescription>
              </div>
              <Switch
                checked={cloudModelsEnabled}
                onCheckedChange={handleCloudModelsToggle}
                disabled={!isAuthenticated || pendingApproval}
              />
            </div>
          </Field>
          <Separator />

          {cloudModelsEnabled && cloudUsage?.plan !== "max" && (
            <Alert variant="secondary">
              <Info className="size-4" />
              <AlertTitle>Cloud Models Active</AlertTitle>
              <AlertDescription>
                Cloud models will be used until your quota is exhausted. After
                that, your configured local AI provider will be used
                automatically if available.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
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
                  const currentSettings = await storage.aiSettings.getValue();
                  const updatedSettings: AISettings = {
                    ...currentSettings,
                    selectedProvider: value as AIProvider,
                  };
                  await storage.aiSettings.setValue(updatedSettings);
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
                disabled={
                  providerOptions.filter((p) => p.available).length === 0
                }
              />
              <FieldDescription>
                {providerOptions.filter((p) => p.available).length === 0
                  ? "Please add at least one API key to select a provider"
                  : cloudModelsEnabled
                    ? "This provider will be used when cloud quota is exhausted"
                    : "Choose which AI provider to use for form filling"}
              </FieldDescription>
            </Field>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};
