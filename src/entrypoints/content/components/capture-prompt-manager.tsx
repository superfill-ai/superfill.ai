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
import { Card } from "@/components/ui/card";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { createLogger } from "@/lib/logger";
import { addNeverAskSite } from "@/lib/storage/capture-settings";
import type { CapturedFieldData } from "@/types/autofill";

const logger = createLogger("capture-prompt-manager");

const HOST_ID = "superfill-capture-prompt";

interface CapturePromptProps {
  siteFavicon: string;
  siteTitle: string;
  siteDomain: string;
  capturedFields: CapturedFieldData[];
  onSave: () => void;
  onDismiss: () => void;
  onNeverAsk: () => void;
}

const CapturePrompt = ({
  siteFavicon,
  siteTitle,
  siteDomain,
  capturedFields,
  onSave,
  onDismiss,
  onNeverAsk,
}: CapturePromptProps) => {
  // Group fields by category
  const groupedFields = capturedFields.reduce(
    (acc, field) => {
      const category = field.fieldMetadata.type || "general";
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
    <Card className="fixed top-4 right-4 w-96 shadow-lg z-999999 bg-background border">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          {siteFavicon && (
            <img
              src={siteFavicon}
              alt=""
              className="w-4 h-4"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div>
            <h3 className="font-semibold text-sm">Save form data?</h3>
            <p className="text-xs text-muted-foreground">{siteTitle}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        <p className="text-sm text-muted-foreground mb-3">
          Superfill detected {totalFields} field{totalFields !== 1 ? "s" : ""}{" "}
          you filled. Save them for future use?
        </p>

        <Accordion type="single" collapsible className="w-full">
          {Object.entries(groupedFields).map(([category, fields]) => (
            <AccordionItem key={category} value={category}>
              <AccordionTrigger className="text-sm">
                {category.charAt(0).toUpperCase() + category.slice(1)} (
                {fields.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {fields.map((field, idx) => (
                    <div
                      key={`${field.fieldOpid}-${idx}`}
                      className="p-2 bg-muted/50 rounded-md text-xs"
                    >
                      <div className="font-medium mb-1 text-foreground">
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
      </div>

      {/* Actions */}
      <div className="p-4 border-t space-y-2">
        <div className="flex gap-2">
          <Button onClick={onSave} className="flex-1" size="sm">
            Save All
          </Button>
          <Button
            onClick={onDismiss}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            Dismiss
          </Button>
        </div>
        <Button
          onClick={onNeverAsk}
          variant="ghost"
          size="sm"
          className="w-full text-xs"
        >
          Never ask for {siteDomain}
        </Button>
      </div>
    </Card>
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
    if (this.isVisible) {
      logger.debug("Capture prompt already visible");
      return;
    }

    this.currentFields = capturedFields;

    // Get site info
    const siteFavicon =
      document.querySelector<HTMLLinkElement>('link[rel*="icon"]')?.href || "";
    const siteTitle = document.title;
    const siteDomain = window.location.hostname;

    logger.debug("Showing capture prompt", {
      fieldsCount: capturedFields.length,
      siteDomain,
    });

    // Create UI if not exists
    if (!this.ui) {
      this.ui = await createShadowRootUi(ctx, {
        name: HOST_ID,
        position: "inline",
        anchor: "body",
        append: "last",
        onMount: (container) => {
          this.root = createRoot(container);
          this.render(siteFavicon, siteTitle, siteDomain);
          return this.root;
        },
        onRemove: (root) => {
          root?.unmount();
          this.root = null;
        },
      });

      this.ui.mount();
    } else {
      this.render(siteFavicon, siteTitle, siteDomain);
    }

    this.isVisible = true;
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

  private render(
    siteFavicon: string,
    siteTitle: string,
    siteDomain: string,
  ): void {
    if (!this.root) return;

    this.root.render(
      <CapturePrompt
        siteFavicon={siteFavicon}
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
