import { getAutofillService } from "@/lib/autofill/autofill-service";
import { createLogger } from "@/lib/logger";
import { getKeyVaultService } from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import { FillTriggerButton } from "../components/fill-trigger-button";

const logger = createLogger("content:fill-trigger-manager");

export class FillTriggerManager {
  private button: FillTriggerButton | null = null;
  private currentField: HTMLElement | null = null;
  private focusTimeout: ReturnType<typeof setTimeout> | null = null;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private isProcessing = false;
  private isEnabled = false;
  private unwatchAiSettings = storage.aiSettings.watch((newSettings) => {
    if (newSettings) {
      const wasEnabled = this.isEnabled;
      this.isEnabled = newSettings.inlineTriggerEnabled;

      if (wasEnabled && !this.isEnabled) {
        this.hideButton();
      }
    }
  });

  private readonly showDelay = 300;
  private readonly hideDelay = 300;

  private boundHandleFocusIn: (e: FocusEvent) => void;
  private boundHandleFocusOut: (e: FocusEvent) => void;

  constructor() {
    this.boundHandleFocusIn = this.handleFocusIn.bind(this);
    this.boundHandleFocusOut = this.handleFocusOut.bind(this);
  }

  async initialize() {
    const settings = await storage.aiSettings.getValue();
    this.isEnabled = settings.inlineTriggerEnabled;

    document.addEventListener("focusin", this.boundHandleFocusIn, true);
    document.addEventListener("focusout", this.boundHandleFocusOut, true);
    logger.debug("FillTriggerManager initialized", { enabled: this.isEnabled });
  }

  private handleFocusIn(event: FocusEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || !this.isValidInputField(target) || !this.isEnabled) return;

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    if (this.focusTimeout) {
      clearTimeout(this.focusTimeout);
    }

    this.focusTimeout = setTimeout(() => {
      void this.showButton(target);
      this.focusTimeout = null;
    }, this.showDelay);
  }

  private handleFocusOut(event: FocusEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || target !== this.currentField || this.isProcessing) return;

    const relatedTarget = event.relatedTarget as HTMLElement | null;
    const buttonHost = document.getElementById("superfill-trigger-host");
    if (relatedTarget && buttonHost?.contains(relatedTarget)) return;

    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.hideTimeout = setTimeout(() => {
      if (document.activeElement !== target && !this.isProcessing) {
        this.hideButton();
      }
      this.hideTimeout = null;
    }, this.hideDelay);
  }

  private isValidInputField(element: HTMLElement): boolean {
    if (!element?.tagName) return false;

    const tagName = element.tagName.toLowerCase();
    if (
      !["input", "textarea", "select"].includes(tagName) &&
      !element.isContentEditable
    ) {
      return false;
    }

    const classString = element.className || "";

    const dropdownClassHints = [
      "select",
      "dropdown",
      "combobox",
      "react-select",
      "choices",
      "autocomplete",
      "remix-css",
      "select__",
      "select-",
      "select_",
    ];

    for (const hint of dropdownClassHints) {
      if (classString.toLowerCase().includes(hint)) {
        return false;
      }
    }

    if (tagName === "input") {
      const inputType = (
        (element as HTMLInputElement).type || ""
      ).toLowerCase();
      const invalid = new Set([
        "hidden",
        "submit",
        "button",
        "reset",
        "file",
        "image",
        "checkbox",
        "radio",
        "select",
      ]);
      if (invalid.has(inputType)) return false;
    }

    try {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }
    } catch (_styleError) {}

    try {
      if (
        (element as HTMLInputElement).disabled ||
        (element as HTMLInputElement).readOnly
      ) {
        return false;
      }
    } catch (_accessError) {}

    return true;
  }

  private async showButton(field: HTMLElement): Promise<void> {
    if (this.isProcessing) return;
    if (this.currentField === field && this.button) return;

    this.hideButton();
    this.currentField = field;

    try {
      this.button = new FillTriggerButton(async () => {
        if (this.isProcessing) return;
        this.isProcessing = true;

        this.hideButton();

        try {
          const aiSettings = await storage.aiSettings.getValue();
          const keyVaultService = getKeyVaultService();
          const apiKey = aiSettings.selectedProvider
            ? await keyVaultService.getKey(aiSettings.selectedProvider)
            : null;

          if (!apiKey) {
            logger.warn("No API key configured for autofill");
            throw new Error("API key not configured");
          }

          const autofillService = getAutofillService();
          await autofillService.startAutofillOnActiveTab();
        } finally {
          this.isProcessing = false;
        }
      });

      await this.button.mount(field);
      logger.debug("Fill trigger shown for field", {
        tag: field.tagName,
        id: field.id,
        name: field.getAttribute("name"),
      });
    } catch (err) {
      logger.error("Failed to mount FillTriggerButton:", err);
      this.button?.remove();
      this.button = null;
      this.currentField = null;
    }
  }

  private hideButton() {
    if (this.focusTimeout) {
      clearTimeout(this.focusTimeout);
      this.focusTimeout = null;
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    this.button?.remove();
    this.button = null;
    this.currentField = null;
    logger.debug("Fill trigger hidden");
  }

  destroy() {
    this.hideButton();
    this.unwatchAiSettings();
    document.removeEventListener("focusin", this.boundHandleFocusIn, true);
    document.removeEventListener("focusout", this.boundHandleFocusOut, true);
    logger.debug("FillTriggerManager destroyed");
  }
}
