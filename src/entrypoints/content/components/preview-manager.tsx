import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { addEntry } from "@/lib/storage/memories";
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
          value: null,
          confidence: 0,
          reasoning: "No suggestion generated",
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
        onSaveNewMemory={(fieldData) => this.handleSaveNewMemory(fieldData)}
      />,
    );
  }

  private async handleSaveNewMemory(fieldData: {
    question: string;
    answer: string;
    category: string;
    tags: string[];
    fieldOpid: FieldOpId;
  }) {
    try {
      logger.info("Saving new memory from field:", fieldData);

      const newMemory = await addEntry({
        question: fieldData.question,
        answer: fieldData.answer,
        category: fieldData.category as
          | "contact"
          | "general"
          | "location"
          | "work"
          | "personal"
          | "education",
        tags: fieldData.tags,
        confidence: 1.0,
      });

      logger.info("Memory saved successfully:", newMemory.id);

      const updatedMapping: FieldMapping = {
        fieldOpid: fieldData.fieldOpid,
        value: fieldData.answer,
        confidence: 1.0,
        reasoning: "User-provided value",
        autoFill: true,
      };

      this.mappingLookup.set(fieldData.fieldOpid, updatedMapping);

      if (this.currentData) {
        const updatedForms = this.currentData.forms.map((form) => ({
          ...form,
          fields: form.fields.map((field) =>
            field.fieldOpid === fieldData.fieldOpid
              ? {
                  ...field,
                  mapping: updatedMapping,
                }
              : field,
          ),
        }));

        const matchedFields = updatedForms.reduce(
          (count, form) =>
            count + form.fields.filter((f) => f.mapping.value !== null).length,
          0,
        );

        this.currentData = {
          forms: updatedForms,
          summary: {
            ...this.currentData.summary,
            matchedFields,
          },
        };

        this.renderCurrentState();
      }

      logger.info(
        "Field mapping updated, memory is now available for autofill",
      );
    } catch (error) {
      logger.error("Failed to save new memory:", error);
      throw error;
    }
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
    try {
      await browser.runtime.sendMessage({
        type: "FILL_ALL_FRAMES",
        fieldsToFill: fieldsToFill.map((f) => ({
          fieldOpid: f.fieldOpid,
          value: f.value,
        })),
      });
    } catch (error) {
      logger.error("Failed to send fill request to background:", error);
      await this.showProgress({
        state: "failed",
        message: "Failed to auto-fill fields. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }

    const filledFieldOpids = fieldsToFill.map((f) => f.fieldOpid);

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

        const matchedCount = filledFieldOpids.filter(
          (opid) => this.mappingLookup.get(opid)?.value !== null,
        ).length;

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

          if (mapping.value) {
            matches.set(formField.name, mapping.value);
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
      if (mapping?.value !== null && mapping !== undefined) {
        totalConfidence += mapping.confidence;
        count++;
      }
    }

    return count > 0 ? totalConfidence / count : 0;
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
      (mapping: FieldMapping) => mapping.value !== null,
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
