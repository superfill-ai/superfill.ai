import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { storage } from "@/lib/storage";

export const RightClickGuideSettings = () => {
  const guideEnabledId = useId();
  const [guideEnabled, setGuideEnabled] = useState<boolean>(true);
  const [neverShowDomains, setNeverShowDomains] = useState<string[]>([]);
  const [snoozedDomains, setSnoozedDomains] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const fetchAndWatch = async () => {
      const settings = await storage.uiSettings.getValue();

      setGuideEnabled(settings.rightClickGuideEnabled ?? true);
      setNeverShowDomains(settings.rightClickGuideNeverShow || []);
      setSnoozedDomains(settings.rightClickGuideSnoozed || {});
    };

    fetchAndWatch();

    const unsubscribe = storage.uiSettings.watch((newSettings) => {
      if (newSettings) {
        setGuideEnabled(newSettings.rightClickGuideEnabled ?? true);
        setNeverShowDomains(newSettings.rightClickGuideNeverShow || []);
        setSnoozedDomains(newSettings.rightClickGuideSnoozed || {});
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSetGuideEnabled = async (enabled: boolean) => {
    const currentSettings = await storage.uiSettings.getValue();
    await storage.uiSettings.setValue({
      ...currentSettings,
      rightClickGuideEnabled: enabled,
    });
  };

  const handleRemoveNeverShow = async (domain: string) => {
    const currentSettings = await storage.uiSettings.getValue();
    const updated = (currentSettings.rightClickGuideNeverShow || []).filter(
      (d) => d !== domain
    );
    await storage.uiSettings.setValue({
      ...currentSettings,
      rightClickGuideNeverShow: updated,
    });
  };

  const handleRemoveSnooze = async (domain: string) => {
    const currentSettings = await storage.uiSettings.getValue();
    const updated = { ...(currentSettings.rightClickGuideSnoozed || {}) };
    delete updated[domain];
    await storage.uiSettings.setValue({
      ...currentSettings,
      rightClickGuideSnoozed: updated,
    });
  };

  const hasNeverShow = neverShowDomains.length > 0;
  const hasSnoozed = Object.keys(snoozedDomains).length > 0;

  return (
    <div className="space-y-4">
      <FieldGroup>
        <Field orientation="horizontal" data-invalid={false}>
          <FieldContent>
            <FieldLabel htmlFor={guideEnabledId}>
              Enable Right-Click Guide
            </FieldLabel>
          </FieldContent>
          <Switch
            id={guideEnabledId}
            checked={guideEnabled}
            onCheckedChange={handleSetGuideEnabled}
          />
        </Field>
      </FieldGroup>

      <Separator />

      {/* Never Show Sites */}
      <div>
        <p className="text-sm font-medium mb-2">
          Sites where guide is disabled
        </p>
        {!hasNeverShow ? (
          <p className="text-xs text-muted-foreground">
            No sites have been permanently blocked
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {neverShowDomains.map((domain) => (
              <Badge
                key={domain}
                variant="secondary"
                className="flex items-center gap-1"
              >
                {domain}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => handleRemoveNeverShow(domain)}
                  aria-label={`Remove ${domain}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Snoozed Sites */}
      {hasSnoozed && (
        <div>
          <p className="text-sm font-medium mb-2">Snoozed sites</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(snoozedDomains).map(([domain, expiryDate]) => {
              const formattedDate = new Date(expiryDate).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric", year: "numeric" }
              );
              return (
                <Badge
                  key={domain}
                  variant="outline"
                  className="flex items-center gap-1"
                >
                  {domain}
                  <span className="text-xs text-muted-foreground">
                    (until {formattedDate})
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() => handleRemoveSnooze(domain)}
                    aria-label={`Remove snooze for ${domain}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
