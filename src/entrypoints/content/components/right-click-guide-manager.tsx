import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { RightClickGuide } from "./right-click-guide";

const logger = createLogger("right-click-guide-manager");

const HOST_ID = "superfill-right-click-guide";

export class RightClickGuideManager {
  private ui: ShadowRootContentScriptUi<Root> | null = null;
  private root: Root | null = null;
  private visible = false;

  // Expose read-only visibility to callers to avoid unnecessary show attempts
  get isVisible(): boolean {
    return this.visible;
  }

  async shouldShowGuide(domain: string): Promise<boolean> {
    try {
      const uiSettings = await storage.uiSettings.getValue();

      // Check if guide is globally enabled
      if (uiSettings.rightClickGuideEnabled === false) {
        return false;
      }

      // Check if permanently disabled for this domain
      if (uiSettings.rightClickGuideNeverShow?.includes(domain)) {
        return false;
      }

      // Check if snoozed
      const snoozedUntil = uiSettings.rightClickGuideSnoozed?.[domain];
      if (snoozedUntil) {
        const expiryDate = new Date(snoozedUntil);
        const now = new Date();

        if (now < expiryDate) {
          return false;
        }

        // Snooze expired, clean it up
        const updatedSnoozed = { ...uiSettings.rightClickGuideSnoozed };
        delete updatedSnoozed[domain];
        await storage.uiSettings.setValue({
          ...uiSettings,
          rightClickGuideSnoozed: updatedSnoozed,
        });
      }

      return true;
    } catch (error) {
      logger.error("Error checking if guide should show:", error);
      return false;
    }
  }

  async show(ctx: ContentScriptContext, domain: string): Promise<boolean> {
    try {
      const shouldShow = await this.shouldShowGuide(domain);
      if (!shouldShow) {
        logger.info("Guide should not be shown for", domain);
        return false;
      }

      if (this.visible) {
        logger.info("Guide is already visible");
        return false;
      }

      if (!this.ui) {
        this.ui = await createShadowRootUi(ctx, {
          name: HOST_ID,
          position: "inline",
          onMount: (container) => {
            const app = document.createElement("div");
            container.append(app);

            this.root = createRoot(app);
            this.render(domain);
            return this.root;
          },
          onRemove: (root) => {
            root?.unmount();
          },
        });
      }

      await this.ui.mount();
      this.visible = true;
      this.render(domain);

      logger.info("Right-click guide shown for", domain);
      return true;
    } catch (error) {
      logger.error("Error showing right-click guide:", error);
      return false;
    }
  }

  hide(): void {
    if (!this.visible) return;

    this.ui?.remove();
    this.visible = false;

    logger.info("Right-click guide hidden");
  }

  private render(domain: string): void {
    if (!this.root) return;

    this.root.render(
      <RightClickGuide
        domain={domain}
        onGotIt={() => this.handleGotIt(domain)}
        onNeverAsk={() => this.handleNeverShow(domain)}
        onClose={() => this.handleClose()}
      />,
    );
  }

  private async handleGotIt(domain: string): Promise<void> {
    try {
      const uiSettings = await storage.uiSettings.getValue();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7); // Snooze for 7 days

      const snoozed = {
        ...(uiSettings.rightClickGuideSnoozed || {}),
        [domain]: expiryDate.toISOString(),
      };

      await storage.uiSettings.setValue({
        ...uiSettings,
        rightClickGuideSnoozed: snoozed,
      });

      logger.info(`Right-click guide snoozed for 7 days on`, domain);
      this.hide();
    } catch (error) {
      logger.error("Error handling 'Got it' action:", error);
    }
  }

  private handleClose(): void {
    // Just close for this session - no persistence
    logger.info("Right-click guide closed for this session");
    this.hide();
  }

  private async handleNeverShow(domain: string): Promise<void> {
    try {
      const uiSettings = await storage.uiSettings.getValue();
      const neverShow = [...(uiSettings.rightClickGuideNeverShow || [])];

      if (!neverShow.includes(domain)) {
        neverShow.push(domain);
      }

      await storage.uiSettings.setValue({
        ...uiSettings,
        rightClickGuideNeverShow: neverShow,
      });

      logger.info("Right-click guide will never be shown on", domain);
      this.hide();
    } catch (error) {
      logger.error("Error handling 'never show' action:", error);
    }
  }

  destroy(): void {
    this.hide();
    this.ui = null;
    this.root = null;
  }
}
