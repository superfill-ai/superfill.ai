import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-service";
import { createLogger } from "@/lib/logger";
import { store } from "@/lib/storage";
import type {
  AutofillProgress,
  DetectedField,
  DetectedFieldSnapshot,
  FieldMapping,
  FieldOpId,
  FormOpId,
} from "@/types/autofill";
import type { FormField, FormMapping } from "@/types/memory";
import { Theme } from "@/types/theme";
import { AutopilotLoader } from "./autopilot-loader";

const logger = createLogger("autopilot-manager");

const HOST_ID = "superfill-autopilot-ui";

export interface AutopilotFillData {
  fieldOpid: string;
  value: string;
  confidence: number;
  memoryId: string;
}

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

type AutopilotManagerOptions = {
  ctx: ContentScriptContext;
  getFieldMetadata: (fieldOpid: FieldOpId) => DetectedField | null;
  getFormMetadata: (formOpid: FormOpId) => { name: string } | null;
};

export class AutopilotManager {
  private readonly options: AutopilotManagerOptions;
  private ui: ShadowRootContentScriptUi<Root> | null = null;
  private reactRoot: Root | null = null;
  private currentProgress: AutofillProgress | null = null;
  private fieldsToFill: AutopilotFillData[] = [];
  private mappingLookup: Map<string, FieldMapping> = new Map();
  private sessionId: string | null = null;

  constructor(options: AutopilotManagerOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (this.ui) return;

    try {
      this.ui = await createShadowRootUi(this.options.ctx, {
        name: HOST_ID,
        position: "inline",
        onMount: (container, shadow, host) => {
          host.id = HOST_ID;
          host.setAttribute("data-ui-type", "autopilot");
          this.applyTheme(shadow);

          if (!this.reactRoot) {
            this.reactRoot = createRoot(container);
          }

          return this.reactRoot;
        },
        onRemove: (root) => {
          root?.unmount();
          this.reactRoot = null;
        },
      });

      logger.info("Autopilot manager initialized");
    } catch (error) {
      logger.error("Failed to initialize autopilot manager:", error);
      throw error;
    }
  }

  private async applyTheme(shadow: ShadowRoot): Promise<void> {
    try {
      const theme = await store.theme.getValue();

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
      logger.warn("Failed to apply theme to autopilot UI:", error);
    }
  }

  private renderAutopilotLoader() {
    if (!this.currentProgress) return null;

    return (
      <AutopilotLoader
        progress={this.currentProgress}
        onClose={() => this.hide()}
      />
    );
  }

  async showProgress(progress: AutofillProgress): Promise<void> {
    try {
      await this.initialize();

      this.currentProgress = progress;

      if (this.ui) {
        this.ui.mount();
      }

      if (this.reactRoot) {
        this.reactRoot.render(this.renderAutopilotLoader());
      }

      logger.info("Showing autopilot progress:", progress.state);
    } catch (error) {
      logger.error("Failed to show autopilot progress:", error);
    }
  }

  async processAutofillData(
    mappings: Array<FieldMapping>,
    confidenceThreshold: number,
    sessionId: string,
  ) {
    try {
      if (mappings.length === 0) {
        logger.warn("No field mappings provided for autopilot processing");
        return [];
      }

      this.mappingLookup = new Map(
        mappings.map((mapping: FieldMapping) => [mapping.fieldOpid, mapping]),
      );
      this.showProgress({
        state: "detecting",
        message: "Preparing data for autofill...",
      });
      this.sessionId = sessionId;

      this.fieldsToFill = mappings
        .filter(
          (mapping) =>
            mapping.value !== null &&
            mapping.memoryId !== null &&
            mapping.confidence >= confidenceThreshold &&
            mapping.autoFill !== false,
        )
        .map((mapping) => ({
          fieldOpid: mapping.fieldOpid,
          value: mapping.value!,
          confidence: mapping.confidence,
          memoryId: mapping.memoryId!,
        }));

      logger.info(
        `Prepared ${this.fieldsToFill.length} fields for autopilot fill`,
      );

      const formMappings = await this.buildFormMappings(
        this.fieldsToFill.map((f) => f.fieldOpid) as FieldOpId[],
      );

      if (formMappings.length > 0) {
        await contentAutofillMessaging.sendMessage("saveFormMappings", {
          sessionId: this.sessionId,
          formMappings,
        });
      }

      await this.executeAutofill();
    } catch (error) {
      logger.error("Failed to process autopilot data:", error);
      return [];
    }
  }

  async executeAutofill(): Promise<boolean> {
    if (this.fieldsToFill.length === 0) {
      logger.warn("No fields to fill in autopilot mode");
      return false;
    }

    try {
      await this.showProgress({
        state: "filling",
        message: "Auto-filling fields...",
        fieldsMatched: this.fieldsToFill.length,
      });
      await contentAutofillMessaging.sendMessage("updateSessionStatus", {
        sessionId: this.sessionId ?? "",
        status: "filling",
      });

      let filledCount = 0;

      for (const field of this.fieldsToFill) {
        try {
          let element = document.querySelector(
            `[data-wxt-field-opid="${field.fieldOpid}"]`,
          ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

          if (!element && field.fieldOpid.startsWith("__")) {
            const index = field.fieldOpid.substring(2);
            const allInputs = document.querySelectorAll(
              "input, textarea, select",
            );
            element = allInputs[parseInt(index)] as
              | HTMLInputElement
              | HTMLTextAreaElement
              | HTMLSelectElement;
          }

          if (element && element.type !== "password") {
            element.value = field.value;
            element.setAttribute("data-autopilot-filled", "true");

            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
            element.dispatchEvent(new Event("blur", { bubbles: true }));

            filledCount++;
            logger.debug(
              `Filled field ${field.fieldOpid} with value: ${field.value}`,
            );
          } else {
            logger.warn(
              `Field element not found or is password field for opid: ${field.fieldOpid}`,
            );
          }
        } catch (fieldError) {
          logger.error(`Failed to fill field ${field.fieldOpid}:`, fieldError);
        }
      }

      await this.showProgress({
        state: "completed",
        message: "Auto-fill completed successfully",
        fieldsDetected: this.fieldsToFill.length,
        fieldsMatched: filledCount,
      });
      await contentAutofillMessaging.sendMessage("updateSessionStatus", {
        sessionId: this.sessionId ?? "",
        status: "completed",
      });

      logger.info(
        `Autopilot completed: filled ${filledCount}/${this.fieldsToFill.length} fields`,
      );

      if (this.sessionId) {
        await this.completeSession();
      }

      return filledCount > 0;
    } catch (error) {
      logger.error("Failed to execute autopilot autofill:", error);

      await this.showProgress({
        state: "failed",
        message: "Auto-fill failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return false;
    }
  }

  private async completeSession(): Promise<void> {
    if (!this.sessionId) {
      logger.warn("No session ID available to complete");
      return;
    }

    try {
      const usedMemoryIds = Array.from(
        new Set(this.fieldsToFill.map((field) => field.memoryId)),
      );

      logger.info(
        `Completing session ${this.sessionId} with ${usedMemoryIds.length} memories used`,
      );

      if (usedMemoryIds.length > 0) {
        await contentAutofillMessaging.sendMessage("incrementMemoryUsage", {
          memoryIds: usedMemoryIds,
        });
        logger.info(
          `Incremented usage count for ${usedMemoryIds.length} memories`,
        );
      }

      await contentAutofillMessaging.sendMessage("completeSession", {
        sessionId: this.sessionId,
      });

      logger.info(`Session ${this.sessionId} completed successfully`);
    } catch (error) {
      logger.error("Failed to complete autopilot session:", error);
    }
  }

  async hide(): Promise<void> {
    if (this.ui) {
      this.ui.remove();
      this.ui = null;
    }

    this.reactRoot = null;
    this.mappingLookup.clear();
    this.currentProgress = null;
    this.fieldsToFill = [];
    this.sessionId = null;

    logger.info("Autopilot manager hidden");
  }

  isActive(): boolean {
    return this.ui !== null;
  }

  getCurrentProgress(): AutofillProgress | null {
    return this.currentProgress;
  }

  private async buildFormMappings(
    selectedFieldOpids: FieldOpId[],
  ): Promise<FormMapping[]> {
    try {
      const pageUrl = window.location.href;
      const formMappings: FormMapping[] = [];
      const memories = await store.memories.getValue();
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
}
