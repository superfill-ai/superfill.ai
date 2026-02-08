import type { AISettings } from "@superfill/shared/types/settings";
import { Badge } from "@superfill/ui/badge";
import { Combobox } from "@superfill/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@superfill/ui/field";
import { Skeleton } from "@superfill/ui/skeleton";
import { useEffect, useId, useState } from "react";
import { useDefaultModel, useProviderModels } from "@/hooks/use-models";
import type { ModelInfo } from "@/lib/providers/model-service";
import type { AIProvider } from "@/lib/providers/registry";
import { storage } from "@/lib/storage";

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
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);

  useEffect(() => {
    const fetchAndWatch = async () => {
      const settings = await storage.aiSettings.getValue();
      const model = settings.selectedModels?.[provider] || defaultModel;
      setSelectedModel(model);
    };

    fetchAndWatch();

    const unsubscribe = storage.aiSettings.watch((newSettings) => {
      if (newSettings) {
        const model = newSettings.selectedModels?.[provider] || defaultModel;
        setSelectedModel(model);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [provider, defaultModel]);

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

  const modelOptions = (models || []).map((model: ModelInfo) => ({
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
          const currentSettings = await storage.aiSettings.getValue();
          const updatedModels = {
            ...currentSettings.selectedModels,
            [provider]: value,
          };
          const updatedSettings: AISettings = {
            ...currentSettings,
            selectedModels: updatedModels,
          };
          await storage.aiSettings.setValue(updatedSettings);
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
