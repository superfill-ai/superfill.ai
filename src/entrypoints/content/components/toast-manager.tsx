import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";

import { storage } from "@/lib/storage";
import type { Theme } from "@/types/theme";

import { Toast, type ToastProps, type ToastType } from "./toast";

const HOST_ID = "superfill-toast-host";
const DEFAULT_DURATION = 5000;

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastProps["action"];
}

export class ToastManager {
  private ui: ShadowRootContentScriptUi<Root> | null = null;
  private root: Root | null = null;
  private toasts: ToastItem[] = [];
  private timers: Map<string, NodeJS.Timeout> = new Map();

  async show(
    ctx: ContentScriptContext,
    message: string,
    type: ToastType = "info",
    options?: {
      duration?: number;
      action?: ToastProps["action"];
    },
  ): Promise<void> {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const toast: ToastItem = { id, message, type, action: options?.action };
    this.toasts.push(toast);

    if (!this.ui) {
      await this.mount(ctx);
    }

    this.render();

    const duration = options?.duration ?? DEFAULT_DURATION;
    if (duration > 0) {
      const timer = setTimeout(() => this.dismiss(id), duration);
      this.timers.set(id, timer);
    }
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    this.toasts = this.toasts.filter((t) => t.id !== id);

    if (this.toasts.length === 0) {
      this.hide();
    } else {
      this.render();
    }
  }

  hide(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.toasts = [];

    if (this.ui) {
      this.ui.remove();
      this.ui = null;
      this.root = null;
    }
  }

  destroy(): void {
    this.hide();
  }

  private async mount(ctx: ContentScriptContext): Promise<void> {
    this.ui = await createShadowRootUi(ctx, {
      name: HOST_ID,
      position: "inline",
      anchor: "body",
      append: "last",
      onMount: (container, shadow, host) => {
        host.id = HOST_ID;
        host.setAttribute("data-ui-type", "toast");
        void this.applyTheme(shadow);
        this.root = createRoot(container);
        this.render();
        return this.root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    this.ui.mount();
  }

  private async applyTheme(shadow: ShadowRoot): Promise<void> {
    try {
      const settings = await storage.uiSettings.getValue();
      this.setThemeClass(shadow, settings.theme ?? "system");

      storage.uiSettings.watch((newSettings) => {
        this.setThemeClass(shadow, newSettings.theme ?? "system");
      });
    } catch {
      this.setThemeClass(shadow, "system");
    }
  }

  private setThemeClass(shadow: ShadowRoot, theme: Theme): void {
    const root = shadow.querySelector("html");
    if (!root) return;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      root.classList.add(prefersDark ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }
  }

  private render(): void {
    if (!this.root) return;

    this.root.render(
      <div className="flex flex-col gap-2">
        {this.toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            action={toast.action}
            onDismiss={() => this.dismiss(toast.id)}
          />
        ))}
      </div>,
    );
  }
}

let instance: ToastManager | null = null;

export function getToastManager(): ToastManager {
  if (!instance) {
    instance = new ToastManager();
  }
  return instance;
}
