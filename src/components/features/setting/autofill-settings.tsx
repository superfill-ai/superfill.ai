import { useId } from "react";
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
import { useAISettingsStore } from "@/lib/stores/ai-settings";

export const AutofillSettings = () => {
  const autofillEnabledId = useId();
  const autopilotModeId = useId();
  const confidenceThresholdId = useId();

  const autoFillEnabled = useAISettingsStore((state) => state.autoFillEnabled);
  const autopilotMode = useAISettingsStore((state) => state.autopilotMode);
  const confidenceThreshold = useAISettingsStore(
    (state) => state.confidenceThreshold,
  );

  const setAutoFillEnabled = useAISettingsStore(
    (state) => state.setAutoFillEnabled,
  );
  const setAutopilotMode = useAISettingsStore(
    (state) => state.setAutopilotMode,
  );
  const setConfidenceThreshold = useAISettingsStore(
    (state) => state.setConfidenceThreshold,
  );

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
                Automatically fill forms with your stored memories
              </FieldDescription>
            </FieldContent>
            <Switch
              id={autofillEnabledId}
              checked={autoFillEnabled}
              onCheckedChange={setAutoFillEnabled}
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
              onCheckedChange={setAutopilotMode}
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
              onChange={setConfidenceThreshold}
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
