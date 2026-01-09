import { X } from "lucide-react";
import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { addNeverAskSite } from "@/lib/storage/capture-settings";
import type { CapturedFieldData } from "@/types/autofill";
import { Theme } from "@/types/theme";

const logger = createLogger("capture-prompt-manager");

const HOST_ID = "superfill-capture-prompt";

interface CapturePromptProps {
  siteTitle: string;
  siteDomain: string;
  capturedFields: CapturedFieldData[];
  onSave: () => void;
  onDismiss: () => void;
  onNeverAsk: () => void;
}

const CapturePrompt = ({
  siteTitle,
  siteDomain,
  capturedFields,
  onSave,
  onDismiss,
  onNeverAsk,
}: CapturePromptProps) => {
  const groupedFields = capturedFields.reduce(
    (acc, field) => {
      const category = field.fieldMetadata.type ?? "general";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(field);
      return acc;
    },
    {} as Record<string, CapturedFieldData[]>,
  );

  const totalFields = capturedFields.length;

  return (
    <div
      className="fixed top-4 right-4 z-9999"
      role="dialog"
      aria-modal="false"
      aria-labelledby="save-memory-title"
    >
      <Card className="w-96 shadow-2xl border border-border/50 backdrop-blur-sm bg-background/95 pointer-events-auto gap-3">
        <CardHeader>
          <CardTitle className="text-sm">Save form data?</CardTitle>
          <CardDescription className="text-xs text-wrap" id="save-memory-title">
            Superfill detected {totalFields} field{totalFields !== 1 ? "s" : ""}{" "}
            you filled on {siteTitle}. Save them for future use?
          </CardDescription>
          <CardAction>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={onDismiss}
              aria-label="Dismiss prompt"
            >
              <X className="size-4" />
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="max-h-80 overflow-y-auto">
          <Accordion type="single" collapsible className="w-full">
            {Object.entries(groupedFields).map(([category, fields]) => (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger className="text-sm">
                  {category.charAt(0).toUpperCase() + category.slice(1)} (
                  {fields.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-1.5">
                    {fields.map((field, idx) => (
                      <div
                        key={`${field.fieldOpid}-${idx}`}
                        className="p-1.5 bg-muted/50 rounded text-xs"
                      >
                        <div className="font-medium mb-0.5 text-foreground">
                          {field.question}
                        </div>
                        <div className="text-muted-foreground truncate">
                          {field.answer}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>

        <CardFooter className="px-3 py-2 flex-row items-center gap-2">
          <Button onClick={onSave} className="flex-1" size="sm">
            Save All
          </Button>
          <Button onClick={onNeverAsk} variant="destructive" size="sm">
            Never ask for {siteDomain}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export class CapturePromptManager {
  private ui: ShadowRootContentScriptUi<Root> | null = null;
  private root: Root | null = null;
  private currentFields: CapturedFieldData[] = [];
  private isVisible = false;

  async show(
    ctx: ContentScriptContext,
    capturedFields: CapturedFieldData[],
  ): Promise<void> {
    this.currentFields = capturedFields;
    const siteTitle = document.title;
    const siteDomain = window.location.hostname;

    logger.debug("Showing capture prompt", {
      fieldsCount: capturedFields.length,
      siteDomain,
    });

    try {
      if (!this.ui) {
        this.ui = await createShadowRootUi(ctx, {
          name: HOST_ID,
          position: "inline",
          anchor: "body",
          append: "last",
          onMount: (container, shadow, host) => {
            host.id = HOST_ID;
            host.setAttribute("data-ui-type", "capture");

            void this.applyTheme(shadow);
            this.root = createRoot(container);
            this.render(siteTitle, siteDomain);
            return this.root;
          },
          onRemove: (root) => {
            root?.unmount();
            this.root = null;
          },
        });
        this.ui.mount();
      }

      this.render(siteTitle, siteDomain);
      this.isVisible = true;
    } catch (error) {
      logger.error("Failed to show capture prompt:", error);

      try {
        this.ui?.remove();
      } catch {}

      this.ui = null;
      this.root = null;
      this.isVisible = false;
    }
  }

  async hide(): Promise<void> {
    if (!this.isVisible) return;

    logger.debug("Hiding capture prompt");

    if (this.ui) {
      this.ui.remove();
      this.ui = null;
    }

    this.root = null;
    this.isVisible = false;
    this.currentFields = [];
  }

  private async applyTheme(shadow: ShadowRoot): Promise<void> {
    try {
      const settings = await storage.uiSettings.getValue();
      const theme = settings.theme;

      const host = shadow.host as HTMLElement;
      host.classList.remove("light", "dark");

      if (theme === Theme.LIGHT) {
        host.classList.add("light");
      } else if (theme === Theme.DARK) {
        host.classList.add("dark");
      } else {
        const isDarkMode =
          document.documentElement.classList.contains("dark") ||
          window.matchMedia("(prefers-color-scheme: dark)").matches;
        host.classList.add(isDarkMode ? "dark" : "light");
      }
    } catch (error) {
      logger.warn("Failed to apply theme to capture prompt:", error);
    }
  }

  private render(siteTitle: string, siteDomain: string): void {
    if (!this.root) return;

    this.root.render(
      <CapturePrompt
        siteTitle={siteTitle}
        siteDomain={siteDomain}
        capturedFields={this.currentFields}
        onSave={() => this.handleSave()}
        onDismiss={() => this.handleDismiss()}
        onNeverAsk={() => this.handleNeverAsk(siteDomain)}
      />,
    );
  }

  private async handleSave(): Promise<void> {
    logger.debug("Saving captured memories");

    try {
      const result = await contentAutofillMessaging.sendMessage(
        "saveCapturedMemories",
        {
          capturedFields: this.currentFields,
        },
      );

      if (result.success) {
        logger.debug(`Saved ${result.savedCount} memories`);
      } else {
        logger.error("Failed to save memories");
      }
    } catch (error) {
      logger.error("Error saving memories:", error);
    }

    await this.hide();
  }

  private async handleDismiss(): Promise<void> {
    logger.debug("Dismissing capture prompt");
    await this.hide();
  }

  private async handleNeverAsk(siteDomain: string): Promise<void> {
    logger.debug(`Adding ${siteDomain} to never ask list`);

    try {
      await addNeverAskSite(siteDomain);
    } catch (error) {
      logger.error("Error adding to never ask list:", error);
    }

    await this.hide();
  }
}
