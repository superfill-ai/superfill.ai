import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useDefaultModel, useProviderModels } from "@/hooks/use-models";
import type { AIProvider } from "@/lib/providers/registry";
import { useSettingsStore } from "@/stores/settings";

interface ModelSelectorProps {
  provider: AIProvider;
  providerName: string;
  hasApiKey: boolean;
}

export const ModelSelector = ({
  provider,
  providerName,
  hasApiKey,
}: ModelSelectorProps) => {
  const comboboxId = useId();
  const { data: models, isLoading } = useProviderModels(provider);
  const defaultModel = useDefaultModel(provider);

  const selectedModels = useSettingsStore((state) => state.selectedModels);
  const setSelectedModel = useSettingsStore((state) => state.setSelectedModel);

  const selectedModel = selectedModels[provider] || defaultModel;

  if (!hasApiKey) {
    return null;
  }

  if (isLoading) {
    return (
      <Field data-invalid={false}>
        <FieldLabel htmlFor={comboboxId}>{providerName} Model</FieldLabel>
        <Skeleton className="h-10 w-full" />
        <FieldDescription>Loading available models...</FieldDescription>
      </Field>
    );
  }

  const modelOptions = (models || []).map((model) => ({
    value: model.id,
    label: model.name,
    badge: model.contextWindow ? (
      <Badge variant="secondary" className="ml-auto text-xs">
        {(model.contextWindow / 1000).toFixed(0)}K
      </Badge>
    ) : undefined,
  }));

  return (
    <Field data-invalid={false}>
      <FieldLabel htmlFor={comboboxId}>{providerName} Model</FieldLabel>
      <Combobox
        id={comboboxId}
        value={selectedModel}
        onValueChange={async (value) => {
          await setSelectedModel(provider, value);
        }}
        options={modelOptions}
        placeholder="Select model..."
        searchPlaceholder="Search models..."
        emptyText="No models found."
      />
      <FieldDescription>
        Choose which {providerName} model to use for form filling
      </FieldDescription>
    </Field>
  );
};
