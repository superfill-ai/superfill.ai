import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { AutofillProgress } from "@/types/autofill";
import type { FilledField, FormMapping } from "@/types/memory";
import type {
  DetectedField,
  DetectedFieldSnapshot,
  DetectedForm,
  DetectedFormSnapshot,
  FieldMapping,
  FieldOpId,
  FormOpId,
  PreviewFieldData,
  PreviewSidebarPayload,
} from "../../../types/autofill";
import { AutofillContainer } from "./autofill-container";

const logger = createLogger("preview-manager");

const HOST_ID = "superfill-autofill-preview";
const HIGHLIGHT_CLASS = "superfill-autofill-highlight";
const HIGHLIGHT_DARK_CLASS = "superfill-autofill-highlight-dark";
const HIGHLIGHT_STYLE_ID = "superfill-autofill-highlight-style";

const ensureHighlightStyle = () => {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 2px solid #f59a69;
      outline-offset: 2px;
      transition: outline 180ms ease, outline-offset 180ms ease;
    }
    .${HIGHLIGHT_CLASS}.${HIGHLIGHT_DARK_CLASS} {
      outline-color: #d87656;
    }
  `;
  document.head.append(style);
};

const getPrimaryLabel = (
  metadata: DetectedFieldSnapshot["metadata"],
): string => {
  const candidates = [
    metadata.labelTag,
    metadata.labelAria,
    metadata.placeholder,
    metadata.name,
    metadata.id,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return metadata.type;
};

const buildPreviewFields = (
  form: DetectedFormSnapshot,
  mappingLookup: Map<string, FieldMapping>,
): PreviewFieldData[] =>
  form.fields.map(
    (field: DetectedFormSnapshot["fields"][number]): PreviewFieldData => {
      const mapping =
        mappingLookup.get(field.selector) ??
        ({
          selector: field.selector,
          value: null,
          confidence: 0,
          reasoning: "No suggestion generated",
          autoFill: false,
        } satisfies FieldMapping);

      return {
        selector: field.selector,
        fieldOpid: field.opid, // For backward compatibility with UI
        formOpid: field.formOpid,
        metadata: field.metadata,
        mapping,
        primaryLabel: getPrimaryLabel(field.metadata),
      };
    },
  );

type PreviewSidebarManagerOptions = {
  ctx: ContentScriptContext;
  getFieldMetadata: (fieldOpid: FieldOpId) => DetectedField | null;
  getFormMetadata: (formOpid: FormOpId) => DetectedForm | null;
};

type PreviewShowParams = {
  payload: PreviewSidebarPayload;
};

export type PreviewRenderData = {
  forms: Array<{
    snapshot: DetectedFormSnapshot;
    fields: PreviewFieldData[];
  }>;
  summary: {
    totalFields: number;
    matchedFields: number;
    processingTime?: number;
  };
};

export class PreviewSidebarManager {
  private readonly options: PreviewSidebarManagerOptions;
  private ui: ShadowRootContentScriptUi<Root> | null = null;
  private reactRoot: Root | null = null;
  private highlightedElement: HTMLElement | null = null;
  private mappingLookup: Map<string, FieldMapping> = new Map();
  private sessionId: string | null = null;
  private currentMode: "loading" | "preview" = "loading";
  private currentProgress: AutofillProgress | null = null;
  private currentData: PreviewRenderData | null = null;

  constructor(options: PreviewSidebarManagerOptions) {
    this.options = options;
    ensureHighlightStyle();
  }

  async show({ payload }: PreviewShowParams) {
    const renderData = this.buildRenderData(payload);
    if (!renderData) {
      // Show "no fields detected" message and auto-close
      await this.showProgress({
        state: "failed",
        message: "No matching fields detected on this page",
        fieldsDetected: payload.forms.reduce(
          (sum, form) => sum + form.fields.length,
          0,
        ),
        fieldsMatched: 0,
      });

      // Auto-close after 3 seconds
      setTimeout(() => {
        this.destroy();
      }, 3000);
      return;
    }

    this.sessionId = payload.sessionId;
    this.currentMode = "preview";
    this.currentData = renderData;

    const ui = await this.ensureUi();

    if (!ui.mounted) {
      ui.mount();
    }

    const root = ui.mounted ?? this.reactRoot;

    if (!root) {
      return;
    }

    this.reactRoot = root;
    this.renderCurrentState();
  }

  async showProgress(progress: AutofillProgress) {
    this.currentMode = "loading";
    this.currentProgress = progress;

    const ui = await this.ensureUi();

    if (!ui.mounted) {
      ui.mount();
    }

    const root = ui.mounted ?? this.reactRoot;

    if (!root) {
      return;
    }

    this.reactRoot = root;
    this.renderCurrentState();
  }

  private renderCurrentState() {
    if (!this.reactRoot) {
      return;
    }

    this.reactRoot.render(
      <AutofillContainer
        mode={this.currentMode}
        progress={this.currentProgress ?? undefined}
        data={this.currentData ?? undefined}
        onClose={() => this.destroy()}
        onFill={(fieldsToFill) => this.handleFill(fieldsToFill)}
        onHighlight={(fieldOpid: FieldOpId) => this.highlightField(fieldOpid)}
        onUnhighlight={() => this.clearHighlight()}
      />,
    );
  }

  destroy() {
    this.clearHighlight();

    if (this.ui) {
      this.ui.remove();
    }

    this.mappingLookup.clear();
  }

  private async handleFill(
    fieldsToFill: { fieldOpid: FieldOpId; value: string }[],
  ) {
    const filledFieldOpids: FieldOpId[] = [];

    for (const { fieldOpid, value } of fieldsToFill) {
      const detected = this.options.getFieldMetadata(fieldOpid);

      if (detected) {
        this.applyValueToElement(detected.element, value);
        filledFieldOpids.push(fieldOpid);
      }
    }

    if (this.sessionId) {
      try {
        await contentAutofillMessaging.sendMessage("updateSessionStatus", {
          sessionId: this.sessionId,
          status: "filling",
        });

        const formMappings = await this.buildFormMappings(filledFieldOpids);

        if (formMappings.length > 0) {
          await contentAutofillMessaging.sendMessage("saveFormMappings", {
            sessionId: this.sessionId,
            formMappings,
          });
        }

        await contentAutofillMessaging.sendMessage("completeSession", {
          sessionId: this.sessionId,
        });

        const matchedCount = filledFieldOpids.filter((opid) => {
          const detected = this.options.getFieldMetadata(opid);
          return (
            detected &&
            this.mappingLookup.get(detected.selector)?.value !== null
          );
        }).length;

        await this.showProgress({
          state: "completed",
          message: "Auto-fill completed successfully",
          fieldsDetected: filledFieldOpids.length,
          fieldsMatched: matchedCount,
        });

        logger.info("Session completed:", this.sessionId);
      } catch (error) {
        logger.error("Failed to complete session:", error);
      }
    }

    this.destroy();
  }

  private async buildFormMappings(
    selectedFieldOpids: FieldOpId[],
  ): Promise<FormMapping[]> {
    try {
      const pageUrl = window.location.href;
      const pageTitle = document.title;
      const formMappings: FormMapping[] = [];

      const formGroups = new Map<FormOpId, DetectedField[]>();
      for (const fieldOpid of selectedFieldOpids) {
        const detected = this.options.getFieldMetadata(fieldOpid);
        if (!detected) continue;

        const formOpid = detected.formOpid;
        if (!formGroups.has(formOpid)) {
          formGroups.set(formOpid, []);
        }
        formGroups.get(formOpid)?.push(detected);
      }

      for (const [formOpid, fields] of formGroups) {
        const formMetadata = this.options.getFormMetadata(formOpid);
        const formSelector = formMetadata?.name || formOpid;

        const filledFields: FilledField[] = [];

        for (const field of fields) {
          const mapping = this.mappingLookup.get(field.selector);
          if (!mapping || !mapping.value) continue;

          const filledField: FilledField = {
            selector: field.selector,
            label: getPrimaryLabel(field.metadata),
            filledValue: mapping.value,
            fieldType: field.metadata.fieldType,
          };
          filledFields.push(filledField);
        }

        if (filledFields.length > 0) {
          formMappings.push({
            url: pageUrl,
            pageTitle,
            formSelector,
            fields: filledFields,
            confidence: this.calculateAverageConfidence(fields),
            timestamp: new Date().toISOString(),
          });
        }
      }

      return formMappings;
    } catch (error) {
      logger.error("Failed to build form mappings:", error);
      return [];
    }
  }

  private calculateAverageConfidence(fields: DetectedField[]): number {
    let totalConfidence = 0;
    let count = 0;

    for (const field of fields) {
      const mapping = this.mappingLookup.get(field.selector);
      if (mapping?.value !== null && mapping !== undefined) {
        totalConfidence += mapping.confidence;
        count++;
      }
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  private applyValueToElement(
    element: DetectedField["element"],
    value: string,
  ) {
    if (element instanceof HTMLInputElement) {
      element.focus({ preventScroll: true });

      if (element.type === "checkbox") {
        // Handle checkbox - normalize boolean-like values
        const shouldCheck = this.parseBooleanValue(value);
        element.checked = shouldCheck;
      } else if (element.type === "radio") {
        // Handle radio button - find and check the right option in the group
        this.applyRadioValue(element, value);
      } else {
        element.value = value;
      }

      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (element instanceof HTMLTextAreaElement) {
      element.focus({ preventScroll: true });
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (element instanceof HTMLSelectElement) {
      this.applySelectValue(element, value);
    }
  }

  /**
   * Parse boolean-like values for checkbox fields
   */
  private parseBooleanValue(value: string): boolean {
    const trueValues = ["true", "yes", "1", "on", "checked"];
    return trueValues.includes(value.toLowerCase().trim());
  }

  /**
   * Apply value to a radio button group
   * Finds the radio with matching value/label and checks it
   */
  private applyRadioValue(element: HTMLInputElement, value: string) {
    const radioName = element.name;
    if (!radioName) {
      // If no name, just check/uncheck this radio
      element.checked = this.parseBooleanValue(value);
      return;
    }

    // Find all radios in this group
    const form = element.form;
    const radios = form
      ? Array.from(
          form.querySelectorAll<HTMLInputElement>(
            `input[type="radio"][name="${radioName}"]`,
          ),
        )
      : Array.from(
          document.querySelectorAll<HTMLInputElement>(
            `input[type="radio"][name="${radioName}"]`,
          ),
        );

    const valueLower = value.toLowerCase().trim();

    // First, try exact match on value
    let matched = radios.find(
      (r) => r.value.toLowerCase().trim() === valueLower,
    );

    // If no exact match, try matching by label text
    if (!matched) {
      for (const radio of radios) {
        const label = this.getRadioLabel(radio);
        if (label && label.toLowerCase().trim() === valueLower) {
          matched = radio;
          break;
        }
      }
    }

    // If still no match, try fuzzy matching
    if (!matched) {
      let bestScore = 0;
      for (const radio of radios) {
        const label = this.getRadioLabel(radio) || radio.value;
        const score = this.fuzzyMatch(value, label);
        if (score > bestScore && score >= 0.6) {
          bestScore = score;
          matched = radio;
        }
      }
    }

    if (matched) {
      matched.checked = true;
      matched.dispatchEvent(new Event("input", { bubbles: true }));
      matched.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  /**
   * Get the label text for a radio button
   */
  private getRadioLabel(radio: HTMLInputElement): string | null {
    // Check for associated label via for attribute
    if (radio.id) {
      const label = document.querySelector<HTMLLabelElement>(
        `label[for="${radio.id}"]`,
      );
      if (label) return label.textContent?.trim() || null;
    }

    // Check for wrapping label
    const parentLabel = radio.closest("label");
    if (parentLabel) {
      // Get text content excluding the radio itself
      const clone = parentLabel.cloneNode(true) as HTMLLabelElement;
      const radioInClone = clone.querySelector('input[type="radio"]');
      if (radioInClone) radioInClone.remove();
      return clone.textContent?.trim() || null;
    }

    return null;
  }

  /**
   * Apply value to a select element with fuzzy matching
   */
  private applySelectValue(element: HTMLSelectElement, value: string) {
    const valueLower = value.toLowerCase().trim();

    // First try exact match on value or text
    for (const option of Array.from(element.options)) {
      if (
        option.value.toLowerCase().trim() === valueLower ||
        option.text.toLowerCase().trim() === valueLower
      ) {
        element.value = option.value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }

    // Try fuzzy matching
    let bestMatch: HTMLOptionElement | null = null;
    let bestScore = 0;

    for (const option of Array.from(element.options)) {
      const textScore = this.fuzzyMatch(value, option.text);
      const valueScore = this.fuzzyMatch(value, option.value);
      const score = Math.max(textScore, valueScore);

      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = option;
      }
    }

    if (bestMatch) {
      element.value = bestMatch.value;
    } else {
      // Fallback to direct assignment
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * Simple fuzzy match score between two strings (0-1)
   */
  private fuzzyMatch(a: string, b: string): number {
    const aLower = a.toLowerCase().trim();
    const bLower = b.toLowerCase().trim();

    if (aLower === bLower) return 1;
    if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.85;

    // Levenshtein-based similarity
    const maxLen = Math.max(aLower.length, bLower.length);
    if (maxLen === 0) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= bLower.length; i++) matrix[i] = [i];
    for (let j = 0; j <= aLower.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= bLower.length; i++) {
      for (let j = 1; j <= aLower.length; j++) {
        if (bLower.charAt(i - 1) === aLower.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return 1 - matrix[bLower.length][aLower.length] / maxLen;
  }

  private highlightField(fieldOpid: FieldOpId) {
    const detected = this.options.getFieldMetadata(fieldOpid);
    if (!detected) {
      return;
    }

    this.clearHighlight();

    const element = detected.element as HTMLElement;
    if (!element) {
      return;
    }

    if (document.documentElement.classList.contains("dark")) {
      element.classList.add(HIGHLIGHT_DARK_CLASS);
    }

    element.classList.add(HIGHLIGHT_CLASS);
    this.highlightedElement = element;
  }

  private clearHighlight() {
    if (!this.highlightedElement) {
      return;
    }

    this.highlightedElement.classList.remove(
      HIGHLIGHT_CLASS,
      HIGHLIGHT_DARK_CLASS,
    );
    this.highlightedElement = null;
  }

  private async ensureUi(): Promise<ShadowRootContentScriptUi<Root>> {
    if (this.ui) {
      return this.ui;
    }

    this.ui = await createShadowRootUi<Root>(this.options.ctx, {
      name: HOST_ID,
      position: "overlay",
      anchor: "body",
      onMount: (uiContainer, _shadow, host) => {
        host.id = HOST_ID;
        host.setAttribute("data-ui-type", "preview");

        const mountPoint = document.createElement("div");
        mountPoint.id = "superfill-autofill-preview-root";
        mountPoint.style.cssText = `
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        `;
        uiContainer.append(mountPoint);

        const root = createRoot(mountPoint);

        this.reactRoot = root;

        (async () => {
          const uiSettings = await storage.uiSettings.getValue();

          uiContainer.classList.add(uiSettings.theme);
        })();

        return root;
      },
      onRemove: (mounted) => {
        mounted?.unmount();
        this.reactRoot = null;
      },
    });

    return this.ui;
  }

  private buildRenderData(
    payload: PreviewSidebarPayload,
  ): PreviewRenderData | null {
    if (!payload.forms.length) {
      return null;
    }

    this.mappingLookup = new Map(
      payload.mappings.map((mapping: FieldMapping) => [
        mapping.selector,
        mapping,
      ]),
    );

    const forms = payload.forms.map((form: DetectedFormSnapshot) => ({
      snapshot: form,
      fields: buildPreviewFields(form, this.mappingLookup),
    }));

    const totalFields = payload.forms.reduce(
      (sum: number, form: DetectedFormSnapshot) => sum + form.fields.length,
      0,
    );

    const matchedFields = payload.mappings.filter(
      (mapping: FieldMapping) => mapping.value !== null,
    ).length;

    // Don't show preview if no fields were matched
    if (matchedFields === 0) {
      logger.info("No fields matched, not showing preview");
      return null;
    }

    return {
      forms,
      summary: {
        totalFields,
        matchedFields,
        processingTime: payload.processingTime,
      },
    };
  }
}
