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
import type { FormField, FormMapping } from "@/types/memory";
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
    metadata.labelData,
    metadata.labelTop,
    metadata.labelLeft,
    metadata.labelRight,
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
        mappingLookup.get(field.opid) ??
        ({
          fieldOpid: field.opid,
          memoryId: null,
          value: null,
          rephrasedValue: null,
          confidence: 0,
          reasoning: "No suggestion generated",
          alternativeMatches: [],
          autoFill: false,
        } satisfies FieldMapping);

      return {
        fieldOpid: field.opid,
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

  getFieldMappings(): Map<FieldOpId, FieldMapping> {
    return this.mappingLookup as Map<FieldOpId, FieldMapping>;
  }

  async show({ payload }: PreviewShowParams) {
    const renderData = this.buildRenderData(payload);
    if (!renderData) {
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
    const memoryIds: string[] = [];
    const filledFieldOpids: FieldOpId[] = [];

    for (const { fieldOpid, value } of fieldsToFill) {
      const detected = this.options.getFieldMetadata(fieldOpid);

      if (!detected) {
        continue;
      }

      const mapping = this.mappingLookup.get(fieldOpid);
      this.applyValueToElement(
        detected.element,
        value,
        mapping?.memoryId || undefined,
        mapping?.confidence,
      );
      filledFieldOpids.push(fieldOpid);

      if (mapping?.memoryId) {
        memoryIds.push(mapping.memoryId);
      }
    }

    logger.info("Filled fields, incrementing memory usage for:", memoryIds);

    if (memoryIds.length > 0) {
      try {
        await contentAutofillMessaging.sendMessage("incrementMemoryUsage", {
          memoryIds,
        });
      } catch (error) {
        logger.error("Failed to increment memory usage:", error);
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

        await this.showProgress({
          state: "completed",
          message: "Auto-fill completed successfully",
          fieldsDetected: filledFieldOpids.length,
          fieldsMatched: memoryIds.length,
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
      const formMappings: FormMapping[] = [];
      const memories = await storage.memories.getValue();
      const memoryMap = new Map(memories.map((m) => [m.id, m]));

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
        const formId = formMetadata?.name || formOpid;

        const formFields: FormField[] = [];
        const matches = new Map();

        for (const field of fields) {
          const mapping = this.mappingLookup.get(field.opid);
          if (!mapping) continue;

          const formField: FormField = {
            element: field.element,
            type: field.metadata.fieldType,
            name: field.metadata.name || field.opid,
            label: getPrimaryLabel(field.metadata),
            placeholder: field.metadata.placeholder || undefined,
            required: field.metadata.required,
            currentValue: mapping.value || "",
            rect: field.metadata.rect,
          };
          formFields.push(formField);

          if (mapping.memoryId) {
            const memory = memoryMap.get(mapping.memoryId);
            if (memory) {
              matches.set(formField.name, memory);
            }
          }
        }

        if (formFields.length > 0) {
          formMappings.push({
            url: pageUrl,
            formId,
            fields: formFields,
            matches,
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
      const mapping = this.mappingLookup.get(field.opid);
      if (mapping?.memoryId) {
        totalConfidence += mapping.confidence;
        count++;
      }
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  private applyValueToElement(
    element: DetectedField["element"],
    value: string,
    memoryId?: string,
    confidence?: number,
  ) {
    if (element instanceof HTMLInputElement) {
      element.focus({ preventScroll: true });

      if (element.type === "checkbox" || element.type === "radio") {
        element.checked = value === "true" || value === "on" || value === "1";
      } else {
        element.value = value;
        element.setAttribute("data-superfill-filled", "true");
        element.setAttribute("data-superfill-original", value);
        if (memoryId) {
          element.setAttribute("data-superfill-memoryid", memoryId);
        }
        if (confidence !== undefined) {
          element.setAttribute(
            "data-superfill-confidence",
            confidence.toString(),
          );
        }
      }

      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (element instanceof HTMLTextAreaElement) {
      element.focus({ preventScroll: true });
      element.value = value;
      element.setAttribute("data-superfill-filled", "true");
      element.setAttribute("data-superfill-original", value);
      if (memoryId) {
        element.setAttribute("data-superfill-memoryid", memoryId);
      }
      if (confidence !== undefined) {
        element.setAttribute(
          "data-superfill-confidence",
          confidence.toString(),
        );
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (element instanceof HTMLSelectElement) {
      const normalizedValue = value.toLowerCase();
      let matched = false;

      for (const option of Array.from(element.options)) {
        if (
          option.value.toLowerCase() === normalizedValue ||
          option.text.toLowerCase() === normalizedValue
        ) {
          option.selected = true;
          matched = true;
          break;
        }
      }

      if (!matched) {
        element.value = value;
      }

      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
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
        mapping.fieldOpid,
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
      (mapping: FieldMapping) => mapping.memoryId !== null,
    ).length;

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
