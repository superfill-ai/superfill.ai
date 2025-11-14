import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUISettingsStore } from "@/lib/stores/ui-settings";
import { Trigger } from "@/types/trigger";

export const TriggerSettings = () => {
  const triggerId = useId();

  const trigger = useUISettingsStore((state) => state.trigger);
  const setTrigger = useUISettingsStore((state) => state.setTrigger);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fill Trigger</CardTitle>
        <CardDescription>
          Choose how the autofill feature is triggered
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field data-invalid={false}>
          <FieldLabel htmlFor={triggerId}>
            Trigger Mode <Badge variant="secondary">Coming Soon</Badge>
          </FieldLabel>
          <Select
            value={trigger}
            onValueChange={(value) => setTrigger(value as Trigger)}
            disabled
          >
            <SelectTrigger id={triggerId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={Trigger.POPUP}>Popup (Default)</SelectItem>
              <SelectItem value={Trigger.CONTENT}>In-Page Content</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            Currently only popup mode is supported
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
};
