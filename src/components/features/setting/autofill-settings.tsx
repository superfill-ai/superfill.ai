import { useEffect, useId, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { SliderWithInput } from "@/components/ui/slider-with-input";
import { Switch } from "@/components/ui/switch";
import { storage } from "@/lib/storage";
import type { AISettings } from "@/types/settings";

export const AutofillSettings = () => {
  const autofillEnabledId = useId();
  const autopilotModeId = useId();
  const confidenceThresholdId = useId();

  const [autoFillEnabled, setAutoFillEnabled] = useState(true);
  const [autopilotMode, setAutopilotMode] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.6);

  useEffect(() => {
    const fetchAndWatch = async () => {
      const settings = await storage.aiSettings.getValue();

      setAutoFillEnabled(settings.autoFillEnabled);
      setAutopilotMode(settings.autopilotMode);
      setConfidenceThreshold(settings.confidenceThreshold);
    };

    fetchAndWatch();

    const unsubscribe = storage.aiSettings.watch((newSettings) => {
      if (newSettings) {
        setAutoFillEnabled(newSettings.autoFillEnabled);
        setAutopilotMode(newSettings.autopilotMode);
        setConfidenceThreshold(newSettings.confidenceThreshold);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSetAutoFillEnabled = async (enabled: boolean) => {
    const currentSettings = await storage.aiSettings.getValue();
    const updatedSettings: AISettings = {
      ...currentSettings,
      autoFillEnabled: enabled,
    };
    await storage.aiSettings.setValue(updatedSettings);
  };

  const handleSetAutopilotMode = async (enabled: boolean) => {
    const currentSettings = await storage.aiSettings.getValue();
    const updatedSettings: AISettings = {
      ...currentSettings,
      autopilotMode: enabled,
    };
    await storage.aiSettings.setValue(updatedSettings);
  };

  const handleSetConfidenceThreshold = async (threshold: number) => {
    const currentSettings = await storage.aiSettings.getValue();
    const updatedSettings: AISettings = {
      ...currentSettings,
      confidenceThreshold: threshold,
    };
    await storage.aiSettings.setValue(updatedSettings);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Autofill Settings</CardTitle>
        <CardDescription>Control how autofill behaves</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal" data-invalid={false}>
            <FieldContent>
              <FieldLabel htmlFor={autofillEnabledId}>
                Enable Autofill
              </FieldLabel>
              <FieldDescription>
                Automatically suggest or fill (in autopilot mode) forms with
                your stored memories
              </FieldDescription>
            </FieldContent>
            <Switch
              id={autofillEnabledId}
              checked={autoFillEnabled}
              onCheckedChange={handleSetAutoFillEnabled}
            />
          </Field>

          <Field orientation="horizontal" data-invalid={false}>
            <FieldContent>
              <FieldLabel htmlFor={autopilotModeId}>Autopilot Mode</FieldLabel>
              <FieldDescription>
                Automatically fill fields without showing preview when
                confidence is above threshold
              </FieldDescription>
            </FieldContent>
            <Switch
              id={autopilotModeId}
              checked={autopilotMode}
              onCheckedChange={handleSetAutopilotMode}
              disabled={!autoFillEnabled}
            />
          </Field>

          <Field data-invalid={false}>
            <SliderWithInput
              id={confidenceThresholdId}
              label="Confidence Threshold"
              min={0}
              max={1}
              step={0.05}
              value={confidenceThreshold}
              onChange={handleSetConfidenceThreshold}
            />
            <FieldDescription>
              Minimum confidence score required for autofill suggestions
              (currently: {confidenceThreshold.toFixed(2)})
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};
