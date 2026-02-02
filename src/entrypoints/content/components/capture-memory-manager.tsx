import { SparklesIcon, X } from "lucide-react";
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
import { Alert } from "@/components/ui/alert";
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
import { CaptureResultLoader } from "./capture-result-loader";

const logger = createLogger("capture-memory-manager");

const HOST_ID = "superfill-capture-memory";

type CaptureResultState = "saving" | "success" | "info" | "error";

interface CaptureMemoryProps {
  siteTitle: string;
  siteDomain: string;
  capturedFields: CapturedFieldData[];
  onSave: () => void;
  onDismiss: () => void;
  onNeverAsk: () => void;
  resultState: CaptureResultState | null;
  savedCount: number;
  skippedCount: number;
  onResultClose: () => void;
}

const CaptureMemory = ({
  siteTitle,
  siteDomain,
  capturedFields,
  onSave,
  onDismiss,
  onNeverAsk,
  resultState,
  savedCount,
  skippedCount,
  onResultClose,
}: CaptureMemoryProps) => {
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
    <>
      <div
        className="fixed top-4 right-4 z-9999"
        role="dialog"
        aria-modal="false"
        aria-labelledby="save-memory-title"
      >
        <Card className="w-96 shadow-2xl border border-border/50 backdrop-blur-sm bg-background/95 pointer-events-auto gap-3">
          <CardHeader>
            <CardTitle className="text-sm">Save form data?</CardTitle>
            <CardDescription
              className="text-xs text-wrap"
              id="save-memory-title"
            >
              Superfill detected {totalFields} field
              {totalFields !== 1 ? "s" : ""} you filled on {siteTitle}. Save
              them for future use?
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
                          key={`${field.formOpid}-${field.fieldOpid}-${idx}`}
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

            <Alert variant="default" className="items-center">
              <SparklesIcon className="size-3" />
              <span className="sr-only">Info</span>
              <span className="text-xs">
                Superfill's AI will intelligently handle duplicate fields by
                either merging them or skipping them!
              </span>
            </Alert>
          </CardContent>

          <CardFooter className="px-3 py-2 flex-row items-center gap-2">
            <Button onClick={onSave} className="flex-1" size="sm">
              Save All
            </Button>
            <Button
              onClick={onNeverAsk}
              variant="destructive"
              size="sm"
              className="flex-1 min-w-0"
            >
              <span
                className="truncate inline-block max-w-full"
                title={`Never ask for ${siteDomain}`}
              >
                Never ask for {siteDomain}
              </span>
            </Button>
          </CardFooter>
        </Card>
      </div>
      {resultState && (
        <CaptureResultLoader
          state={resultState}
          totalFields={capturedFields.length}
          savedCount={savedCount}
          skippedCount={skippedCount}
          onClose={onResultClose}
        />
      )}
    </>
  );
};

export class CaptureMemoryManager {
  private ui: ShadowRootContentScriptUi<Root> | null = null;
  private root: Root | null = null;
  private currentFields: CapturedFieldData[] = [];
  private isVisible = false;
  private resultState: CaptureResultState | null = null;
  private savedCount = 0;
  private skippedCount = 0;

  async show(
    ctx: ContentScriptContext,
    capturedFields: CapturedFieldData[],
  ): Promise<void> {
    this.currentFields = capturedFields;
    const siteTitle = document.title;
    const siteDomain = window.location.hostname;

    logger.info("Showing capture memory", {
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
      logger.error("Failed to show capture memory:", error);

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

    logger.info("Hiding capture memory");

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
      logger.warn("Failed to apply theme to capture memory:", error);
    }
  }

  private render(siteTitle: string, siteDomain: string): void {
    if (!this.root) return;

    this.root.render(
      <CaptureMemory
        siteTitle={siteTitle}
        siteDomain={siteDomain}
        capturedFields={this.currentFields}
        onSave={() => this.handleSave()}
        onDismiss={() => this.handleDismiss()}
        onNeverAsk={() => this.handleNeverAsk(siteDomain)}
        resultState={this.resultState}
        savedCount={this.savedCount}
        skippedCount={this.skippedCount}
        onResultClose={() => this.handleResultClose()}
      />,
    );
  }

  private handleResultClose(): void {
    this.resultState = null;
    this.savedCount = 0;
    this.skippedCount = 0;
    const siteTitle = document.title;
    const siteDomain = window.location.hostname;
    this.render(siteTitle, siteDomain);
  }

  private async handleSave(): Promise<void> {
    logger.info("Saving captured memories");

    const siteTitle = document.title;
    const siteDomain = window.location.hostname;

    this.resultState = "saving";
    this.render(siteTitle, siteDomain);

    try {
      const result = await contentAutofillMessaging.sendMessage(
        "saveCapturedMemories",
        {
          capturedFields: this.currentFields,
        },
      );

      if (result.success) {
        logger.info(`Saved ${result.savedCount} memories`);

        const totalFields = this.currentFields.length;
        this.savedCount = result.savedCount;
        this.skippedCount = totalFields - this.savedCount;

        logger.info(
          `Saved ${this.savedCount} memories, skipped ${this.skippedCount} duplicates`,
        );

        this.resultState = this.savedCount > 0 ? "success" : "info";
        this.render(siteTitle, siteDomain);

        await new Promise((resolve) => setTimeout(resolve, 3000));
        await this.hide();
      } else {
        logger.error("Failed to save memories");
        this.resultState = "error";
        this.render(siteTitle, siteDomain);

        await new Promise((resolve) => setTimeout(resolve, 3000));
        await this.hide();
      }
    } catch (error) {
      logger.error("Error saving memories:", error);
      this.resultState = "error";
      this.render(siteTitle, siteDomain);

      await new Promise((resolve) => setTimeout(resolve, 3000));
      await this.hide();
    }
  }

  private async handleDismiss(): Promise<void> {
    logger.info("Dismissing capture memory");
    await this.hide();
  }

  private async handleNeverAsk(siteDomain: string): Promise<void> {
    logger.info(`Adding ${siteDomain} to never ask list`);

    try {
      await addNeverAskSite(siteDomain);
    } catch (error) {
      logger.error("Error adding to never ask list:", error);
    }

    await this.hide();
  }
}
