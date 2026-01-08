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
  FieldDescription,
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
    <Card>
      <CardHeader>
        <CardTitle>Memory Capture Settings</CardTitle>
        <CardDescription>
          Control when and where memory capture happens
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
          <FieldDescription>
            When enabled, Superfill will prompt you to save form data after
            submission
          </FieldDescription>

          {neverAskSites.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <FieldLabel>Sites where capture is disabled</FieldLabel>
                <FieldDescription>
                  You've chosen to never save memories from these sites
                </FieldDescription>
                <div className="flex flex-wrap gap-2 mt-2">
                  {neverAskSites.map((site) => (
                    <Badge
                      key={site}
                      variant="secondary"
                      className="px-2 py-1 flex items-center gap-1"
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
              </div>
            </>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
};
