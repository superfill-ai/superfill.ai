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
import { storage } from "@/lib/storage";
import { Trigger } from "@/types/trigger";

export const TriggerSettings = () => {
  const triggerId = useId();
  const [trigger, setTrigger] = useState<Trigger>("popup");

  useEffect(() => {
    const fetchAndWatch = async () => {
      const ui = await storage.uiSettings.getValue();
      setTrigger(ui.trigger || "popup");
    };

    fetchAndWatch();

    const unsubscribe = storage.uiSettings.watch((newSettings, oldSettings) => {
      if (newSettings?.trigger !== oldSettings?.trigger) {
        setTrigger(newSettings?.trigger || Trigger.POPUP);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

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
