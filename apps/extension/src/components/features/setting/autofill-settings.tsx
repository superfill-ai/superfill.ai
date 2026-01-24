import type { AISettings } from "@superfill/shared/types/settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superfill/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@superfill/ui/field";
import { Separator } from "@superfill/ui/separator";
import { SliderWithInput } from "@superfill/ui/slider-with-input";
import { Switch } from "@superfill/ui/switch";
import { useEffect, useId, useState } from "react";
import { storage } from "@/lib/storage";

export const AutofillSettings = () => {
  const autofillEnabledId = useId();
  const autopilotModeId = useId();
  const confidenceThresholdId = useId();
  const inlineTriggerEnabledId = useId();
  const contextMenuEnabledId = useId();

  const [autoFillEnabled, setAutoFillEnabled] = useState(true);
  const [autopilotMode, setAutopilotMode] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.6);
  const [inlineTriggerEnabled, setInlineTriggerEnabled] = useState(false);
  const [contextMenuEnabled, setContextMenuEnabled] = useState(true);

  useEffect(() => {
    const fetchAndWatch = async () => {
      const settings = await storage.aiSettings.getValue();

      setAutoFillEnabled(settings.autoFillEnabled);
      setAutopilotMode(settings.autopilotMode);
      setConfidenceThreshold(settings.confidenceThreshold);
      setInlineTriggerEnabled(settings.inlineTriggerEnabled);
      setContextMenuEnabled(settings.contextMenuEnabled);
    };

    fetchAndWatch();

    const unsubscribe = storage.aiSettings.watch((newSettings) => {
      if (newSettings) {
        setAutoFillEnabled(newSettings.autoFillEnabled);
        setAutopilotMode(newSettings.autopilotMode);
        setConfidenceThreshold(newSettings.confidenceThreshold);
        setInlineTriggerEnabled(newSettings.inlineTriggerEnabled);
        setContextMenuEnabled(newSettings.contextMenuEnabled);
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

  const handleSetInlineTriggerEnabled = async (enabled: boolean) => {
    const currentSettings = await storage.aiSettings.getValue();
    const updatedSettings: AISettings = {
      ...currentSettings,
      inlineTriggerEnabled: enabled,
    };
    await storage.aiSettings.setValue(updatedSettings);
  };

  const handleSetContextMenuEnabled = async (enabled: boolean) => {
    const currentSettings = await storage.aiSettings.getValue();
    const updatedSettings: AISettings = {
      ...currentSettings,
      contextMenuEnabled: enabled,
    };
    await storage.aiSettings.setValue(updatedSettings);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Autofill & Trigger Settings</CardTitle>
        <CardDescription>
          Control how autofill & trigger behaves
        </CardDescription>
      </CardHeader>
      <CardContent data-tour="autofill-settings">
        <FieldGroup>
          <Field
            orientation="horizontal"
            data-invalid={false}
            data-tour="autofill-enabled"
          >
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

          <Field
            orientation="horizontal"
            data-invalid={false}
            data-tour="autopilot-mode"
          >
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

          <Field data-invalid={false} data-tour="confidence-threshold">
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

          <Separator />

          <Field
            orientation="horizontal"
            data-invalid={false}
            data-tour="inline-trigger"
          >
            <FieldContent>
              <FieldLabel htmlFor={inlineTriggerEnabledId}>
                Inline Fill Trigger Button
              </FieldLabel>
              <FieldDescription>
                Show fill button when focusing on input fields. Note: This can
                conflict with similar buttons from third-party extensions like
                Bitwarden.
              </FieldDescription>
            </FieldContent>
            <Switch
              id={inlineTriggerEnabledId}
              checked={inlineTriggerEnabled}
              onCheckedChange={handleSetInlineTriggerEnabled}
              disabled={!autoFillEnabled}
            />
          </Field>

          <Field
            orientation="horizontal"
            data-invalid={false}
            data-tour="context-menu"
          >
            <FieldContent>
              <FieldLabel htmlFor={contextMenuEnabledId}>
                Right-Click Context Menu
              </FieldLabel>
              <FieldDescription>
                Show "Fill with superfill.ai" option in right-click context menu
              </FieldDescription>
            </FieldContent>
            <Switch
              id={contextMenuEnabledId}
              checked={contextMenuEnabled}
              onCheckedChange={handleSetContextMenuEnabled}
              disabled={!autoFillEnabled}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};
