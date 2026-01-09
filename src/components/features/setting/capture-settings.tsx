import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  getCaptureSettings,
  removeNeverAskSite,
  updateCaptureSettings,
} from "@/lib/storage/capture-settings";

export const CaptureSettings = () => {
  const captureEnabledId = useId();

  const [captureEnabled, setCaptureEnabled] = useState(true);
  const [neverAskSites, setNeverAskSites] = useState<string[]>([]);

  useEffect(() => {
    const fetchSettings = async () => {
      const settings = await getCaptureSettings();
      setCaptureEnabled(settings.enabled);
      setNeverAskSites(settings.neverAskSites);
    };

    fetchSettings();
  }, []);

  const handleSetCaptureEnabled = async (enabled: boolean) => {
    await updateCaptureSettings({ enabled });
    setCaptureEnabled(enabled);
  };

  const handleRemoveSite = async (site: string) => {
    await removeNeverAskSite(site);
    const settings = await getCaptureSettings();
    setNeverAskSites(settings.neverAskSites);
  };

  return (
    <Card data-tour="capture-settings">
      <CardHeader>
        <CardTitle>Memory Capture Settings</CardTitle>
        <CardDescription>
          Control when and where automatic memory capture happens
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal" data-invalid={false}>
            <FieldLabel htmlFor={captureEnabledId}>
              Enable Memory Capture
            </FieldLabel>
            <FieldContent>
              <Switch
                id={captureEnabledId}
                checked={captureEnabled}
                onCheckedChange={handleSetCaptureEnabled}
              />
            </FieldContent>
          </Field>
        </FieldGroup>
        <Separator className="my-4" />
        <p className="text-sm font-medium">Sites where capture is disabled</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {neverAskSites.map((site) => (
            <Badge
              key={site}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {site}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => handleRemoveSite(site)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
