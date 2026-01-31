import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { Theme } from "@/types/theme";
import { RightClickGuide } from "./right-click-guide";

const logger = createLogger("right-click-guide-manager");
const HOST_ID = "superfill-right-click-guide";

export class RightClickGuideManager {
  private ui: ShadowRootContentScriptUi<Root> | null = null;
  private root: Root | null = null;
  private visible = false;

  get isVisible(): boolean {
    return this.visible;
  }

  async shouldShowGuide(): Promise<boolean> {
    try {
      const uiSettings = await storage.uiSettings.getValue();

      if (uiSettings.rightClickGuideDismissed) {
        return false;
      }

      const snoozedUntil = uiSettings.rightClickGuideSnoozedUntil;

      if (snoozedUntil) {
        const expiryDate = new Date(snoozedUntil);
        const now = new Date();

        if (now < expiryDate) {
          return false;
        }

        await storage.uiSettings.setValue({
          ...uiSettings,
          rightClickGuideSnoozedUntil: undefined,
        });
      }

      return true;
    } catch (error) {
      logger.error("Error checking if guide should show:", error);
      return true;
    }
  }

  async show(ctx: ContentScriptContext): Promise<boolean> {
    try {
      const shouldShow = await this.shouldShowGuide();

      if (!shouldShow) {
        logger.info("Guide should not be shown");
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
          anchor: "body",
          append: "last",
          onMount: (container, shadow, host) => {
            host.id = HOST_ID;
            host.setAttribute("data-ui-type", "right-click-guide");

            void this.applyTheme(shadow);
            this.root = createRoot(container);
            this.render();
            return this.root;
          },
          onRemove: (root) => {
            root?.unmount();
          },
        });
      }

      await this.ui.mount();
      this.visible = true;
      this.render();
      logger.info("Right-click guide shown");
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

  private render(): void {
    if (!this.root) return;

    this.root.render(
      <RightClickGuide
        onSnooze={() => this.handleSnooze()}
        onDismiss={() => this.handleDismiss()}
      />,
    );
  }

  private async handleSnooze(): Promise<void> {
    try {
      const uiSettings = await storage.uiSettings.getValue();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 15);

      await storage.uiSettings.setValue({
        ...uiSettings,
        rightClickGuideSnoozedUntil: expiryDate.toISOString(),
      });

      logger.info("Right-click guide snoozed for 15 days");
      this.hide();
    } catch (error) {
      logger.error("Error handling snooze action:", error);
    }
  }

  private async handleDismiss(): Promise<void> {
    try {
      const uiSettings = await storage.uiSettings.getValue();

      await storage.uiSettings.setValue({
        ...uiSettings,
        rightClickGuideDismissed: true,
        rightClickGuideSnoozedUntil: undefined,
      });

      logger.info("Right-click guide permanently dismissed");
      this.hide();
    } catch (error) {
      logger.error("Error handling dismiss action:", error);
    }
  }

  destroy(): void {
    this.hide();
    this.ui = null;
    this.root = null;
  }
}
