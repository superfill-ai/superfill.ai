import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import { handleFill as fillFields } from "@/entrypoints/content/lib/fill-handler";
import { getFrameInfo } from "@/entrypoints/content/lib/iframe-handler";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import {
  type NormalizedFillField,
  normalizeFieldsToFill,
} from "@/lib/autofill/field-normalization";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type {
  AutofillProgress,
  CDPDetectedField,
  DetectedField,
  DetectedFieldSnapshot,
  DetectedFormSnapshot,
  FieldMapping,
  FieldOpId,
  FillFieldsResult,
  FormOpId,
} from "@/types/autofill";
import type { FilledField, FormMapping } from "@/types/memory";
import { Theme } from "@/types/theme";
import { AutopilotLoader } from "./autopilot-loader";

const logger = createLogger("autopilot-manager");

const HOST_ID = "superfill-autopilot-ui";

const getFillFailureMessage = (result: FillFieldsResult): string => {
  const failedOutcome = result.outcomes.find(
    (outcome) => outcome.status !== "filled",
  );

  return failedOutcome?.reason ?? "One or more fields could not be filled.";
};

export type AutopilotFillData = NormalizedFillField;

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

type AutopilotManagerOptions = {
  ctx: ContentScriptContext;
  getFieldMetadata: (fieldOpid: FieldOpId) => DetectedField | null;
  getFormMetadata: (formOpid: FormOpId) => { name: string } | null;
};

type ProcessAutofillDataParams = {
  readonly mappings: readonly FieldMapping[];
  readonly confidenceThreshold: number;
  readonly sessionId: string;
  readonly forms: readonly DetectedFormSnapshot[];
  readonly cdpFields?: readonly CDPDetectedField[];
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
      logger.warn(
        "Failed to apply theme to autopilot UI:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private renderAutopilotLoader() {
    if (!this.currentProgress) return null;

    return (
      <AutopilotLoader
        progress={this.currentProgress}
        onClose={() => this.destroy()}
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
      logger.error(
        "Failed to show autopilot progress:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async processAutofillData({
    mappings,
    confidenceThreshold,
    sessionId,
    forms,
    cdpFields,
  }: ProcessAutofillDataParams) {
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

      this.fieldsToFill = normalizeFieldsToFill({
        mappings,
        confidenceThreshold,
        detectedFields: forms.flatMap((form) => form.fields),
        cdpFields,
      });

      logger.info(
        `Prepared ${this.fieldsToFill.length} fields for autopilot fill`,
      );

      const formMappings = await this.buildFormMappings(
        this.fieldsToFill.map((f) => f.fieldOpid),
      );

      if (formMappings.length > 0) {
        await contentAutofillMessaging.sendMessage("saveFormMappings", {
          sessionId: this.sessionId,
          formMappings,
        });
      }

      await this.executeAutofill();
    } catch (error) {
      logger.error(
        "Failed to process autopilot data:",
        error instanceof Error ? error.message : String(error),
      );
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

      try {
        const frameInfo = getFrameInfo();
        let fillResult: FillFieldsResult;

        if (frameInfo.isMainFrame) {
          fillResult = await contentAutofillMessaging.sendMessage(
            "broadcastFillToAllFrames",
            {
              fieldsToFill: this.fieldsToFill,
            },
          );
        } else {
          fillResult = await fillFields(this.fieldsToFill, frameInfo, {
            getCachedField: this.options.getFieldMetadata,
          });
        }

        if (!fillResult.ok) {
          await this.showProgress({
            state: "failed",
            message: "Auto-fill failed",
            error: getFillFailureMessage(fillResult),
          });
          return false;
        }
      } catch (error) {
        logger.error("Failed to fill fields:", error);
        await this.showProgress({
          state: "failed",
          message: "Auto-fill failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return false;
      }

      await this.showProgress({
        state: "completed",
        message: "Auto-fill completed successfully",
        fieldsDetected: this.fieldsToFill.length,
        fieldsMatched: this.fieldsToFill.length,
      });
      await contentAutofillMessaging.sendMessage("updateSessionStatus", {
        sessionId: this.sessionId ?? "",
        status: "completed",
      });

      logger.info(
        `Autopilot completed: filled ${this.fieldsToFill.length} fields`,
      );

      if (this.sessionId) {
        await this.completeSession();
      }

      return this.fieldsToFill.length > 0;
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
      await contentAutofillMessaging.sendMessage("completeSession", {
        sessionId: this.sessionId,
      });

      logger.info(`Session ${this.sessionId} completed successfully`);
    } catch (error) {
      logger.error(
        "Failed to complete autopilot session:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  destroy() {
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

        const formFields: FilledField[] = [];

        for (const field of fields) {
          const mapping = this.mappingLookup.get(field.opid);
          if (!mapping) continue;

          const filledField: FilledField = {
            selector: "",
            label: getPrimaryLabel(field.metadata),
            filledValue: mapping.value || "",
            fieldType: field.metadata.fieldType,
          };
          formFields.push(filledField);
        }

        if (formFields.length > 0) {
          formMappings.push({
            url: pageUrl,
            pageTitle: document.title,
            formSelector: formMetadata?.name,
            fields: formFields,
            confidence: this.calculateAverageConfidence(fields),
            timestamp: new Date().toISOString(),
          });
        }
      }

      return formMappings;
    } catch (error) {
      logger.error(
        "Failed to build form mappings:",
        error instanceof Error ? error.message : String(error),
      );
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
}
