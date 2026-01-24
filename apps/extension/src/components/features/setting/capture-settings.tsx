import { createLogger } from "@superfill/shared/logger";
import { Badge } from "@superfill/ui/badge";
import { Button } from "@superfill/ui/button";
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
  FieldGroup,
  FieldLabel,
} from "@superfill/ui/field";
import { Separator } from "@superfill/ui/separator";
import { Switch } from "@superfill/ui/switch";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  getCaptureSettings,
  removeNeverAskSite,
  updateCaptureSettings,
} from "@/lib/storage/capture-settings";

const logger = createLogger("capture-settings");

export const CaptureSettings = () => {
  const captureEnabledId = useId();
  const [captureEnabled, setCaptureEnabled] = useState<boolean | undefined>(
    undefined,
  );
  const [neverAskSites, setNeverAskSites] = useState<string[]>([]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await getCaptureSettings();
        setCaptureEnabled(settings.enabled);
        setNeverAskSites(settings.neverAskSites);
      } catch (error) {
        logger.error("Failed to fetch capture settings:", error);
      }
    };
    fetchSettings();
  }, []);

  const handleSetCaptureEnabled = async (enabled: boolean) => {
    const previousState = captureEnabled;
    setCaptureEnabled(enabled);
    try {
      await updateCaptureSettings({ enabled });
    } catch (error) {
      logger.error("Failed to update capture settings:", error);
      setCaptureEnabled(previousState);
    }
  };

  const handleRemoveSite = async (site: string) => {
    const previousSites = neverAskSites;
    setNeverAskSites(neverAskSites.filter((s) => s !== site));
    try {
      await removeNeverAskSite(site);
    } catch (error) {
      logger.error("Failed to remove site from never-ask list:", error);
      setNeverAskSites(previousSites);
    }
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
            <FieldContent>
              <FieldLabel htmlFor={captureEnabledId}>
                Enable Memory Capture
              </FieldLabel>
            </FieldContent>
            <Switch
              id={captureEnabledId}
              checked={captureEnabled}
              onCheckedChange={handleSetCaptureEnabled}
            />
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
