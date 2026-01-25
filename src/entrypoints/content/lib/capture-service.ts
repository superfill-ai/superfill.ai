import { isTrackableFieldType } from "@/lib/copies";
import { createLogger } from "@/lib/logger";
import type {
  CapturedFieldData,
  DetectedForm,
  FieldMapping,
  FieldOpId,
  TrackedFieldData,
} from "@/types/autofill";
import type { FieldDataTracker } from "./field-data-tracker";
import type { FormDetectionService } from "./form-detection-service";
import type { FormSubmissionMonitor } from "./form-submission-monitor";
import { serializeForms } from "./iframe-handler";

const logger = createLogger("capture-service");

export class CaptureService {
  private mutationObserver: MutationObserver | null = null;
  private formDetectionService: FormDetectionService | null = null;
  private fieldTracker: FieldDataTracker | null = null;
  private submissionMonitor: FormSubmissionMonitor | null = null;
  private sessionId: string | null = null;
  private lastFormCount = 0;
  private recheckFormsTimeout: number | null = null;

  initializeAutoTracking = async (
    formDetectionService: FormDetectionService,
    fieldTracker: FieldDataTracker,
    submissionMonitor: FormSubmissionMonitor,
  ) => {
    this.formDetectionService = formDetectionService;
    this.fieldTracker = fieldTracker;
    this.submissionMonitor = submissionMonitor;

    try {
      let allForms: DetectedForm[];
      if (formDetectionService.hasCachedForms()) {
        logger.info(
          `Reusing ${formDetectionService.getCacheStats().formCount} cached forms for auto-tracking`,
        );
        allForms = formDetectionService.getCachedForms();
      } else {
        logger.info("Cache empty, detecting forms for auto-tracking");
        const result = await formDetectionService.detectFormsInCurrentFrame();
        if (!result.success) {
          logger.error("Failed to detect forms:", result.error);
          return;
        }
        allForms = formDetectionService.getCachedForms();
      }

      this.sessionId = crypto.randomUUID();
      await fieldTracker.startTracking(
        window.location.href,
        document.title,
        this.sessionId,
      );

      if (allForms.length === 0) {
        logger.info(
          "No forms detected initially, setting up mutation observer for dynamic forms...",
        );
        this.startMutationObserver();
        return;
      }

      this.lastFormCount = allForms.length;
      this.attachFieldListeners(allForms);

      logger.info(`Auto-tracking initialized: ${allForms.length} forms`);

      this.startMutationObserver();
    } catch (error) {
      logger.error("Failed to initialize auto-tracking:", error);
    }
  };

  private attachFieldListeners(allForms: DetectedForm[]): void {
    if (!this.formDetectionService || !this.fieldTracker) return;

    const serializedFormCache = serializeForms(allForms);

    const emptyMappings = new Map<FieldOpId, FieldMapping>();
    const allSerializedFields = serializedFormCache.flatMap((f) => f.fields);

    logger.info(`Attaching listeners to ${allSerializedFields.length} fields`);

    if (!this.formDetectionService) {
      logger.error("Form detection service not initialized");
      return;
    }

    this.fieldTracker.attachFieldListeners(
      allSerializedFields,
      emptyMappings,
      // biome-ignore lint/style/noNonNullAssertion: its aight
      (opid) => this.formDetectionService!.getCachedField(opid),
    );

    if (this.submissionMonitor) {
      const fieldsToRegister = this.formDetectionService
        .getAllCachedFieldEntries()
        .map(([opid, field]) => ({
          opid,
          element: field.element,
          formElement: field.element.form || null,
        }));
      this.submissionMonitor.registerFields(fieldsToRegister);
    }

    logger.info("Auto-tracking listeners attached for form submission capture");
  }

  private startMutationObserver(): void {
    if (this.mutationObserver) {
      return;
    }

    logger.info("Starting mutation observer for dynamic forms...");

    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldRecheck = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (
                element.tagName === "FORM" ||
                element.tagName === "INPUT" ||
                element.tagName === "TEXTAREA" ||
                element.tagName === "SELECT" ||
                element.querySelector("form") ||
                element.querySelector("input:not([type='hidden'])") ||
                element.querySelector("textarea") ||
                element.querySelector("select")
              ) {
                logger.info("New form element detected:", element.tagName);
                shouldRecheck = true;
                break;
              }
            }
          }
        }
        if (shouldRecheck) break;
      }

      if (shouldRecheck) {
        this.recheckForms();
      }
    });

    if (document.body) {
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      const onBodyReady = () => {
        if (this.mutationObserver && document.body) {
          this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
          });
        }
        document.removeEventListener("DOMContentLoaded", onBodyReady);
      };
      document.addEventListener("DOMContentLoaded", onBodyReady);
    }
  }

  private recheckForms = () => {
    if (this.recheckFormsTimeout) {
      clearTimeout(this.recheckFormsTimeout);
    }

    this.recheckFormsTimeout = window.setTimeout(async () => {
      if (!this.formDetectionService) return;

      await this.formDetectionService.detectFormsInCurrentFrame();
      const allForms = this.formDetectionService.getCachedForms();

      if (allForms.length > this.lastFormCount) {
        logger.info(
          `New forms detected! ${allForms.length} total (was ${this.lastFormCount})`,
        );
        this.lastFormCount = allForms.length;
        this.attachFieldListeners(allForms);
      }
    }, 500);
  };

  dispose(): void {
    if (this.recheckFormsTimeout) {
      clearTimeout(this.recheckFormsTimeout);
      this.recheckFormsTimeout = null;
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    this.formDetectionService = null;
    this.fieldTracker = null;
    this.submissionMonitor = null;

    this.sessionId = null;
    this.lastFormCount = 0;
  }

  identifyCaptureOpportunities(
    trackedFields: TrackedFieldData[],
  ): CapturedFieldData[] {
    logger.info(`Processing ${trackedFields.length} tracked fields`);

    const userEntered = this.findUserEnteredFields(trackedFields);
    logger.info(`Found ${userEntered.length} user-entered fields to capture`);

    return userEntered;
  }

  private findUserEnteredFields(
    trackedFields: TrackedFieldData[],
  ): CapturedFieldData[] {
    const userEntered: CapturedFieldData[] = [];

    for (const tracked of trackedFields) {
      if (tracked.wasAIFilled) {
        logger.info(`Skipping field ${tracked.fieldOpid}: was AI-filled`);
        continue;
      }

      if (!tracked.value || tracked.value.trim() === "") {
        logger.info(`Skipping field ${tracked.fieldOpid}: empty value`);
        continue;
      }

      if (!this.isTrackableFieldType(tracked.metadata.fieldType)) {
        logger.info(
          `Skipping field ${tracked.fieldOpid}: non-trackable type ${tracked.metadata.fieldType}`,
        );
        continue;
      }

      const question = this.extractQuestion(tracked.metadata);
      if (!question) {
        logger.info(
          `Skipping field ${tracked.fieldOpid}: no question/label extracted`,
        );
        continue;
      }

      logger.info(
        `Capturing user-entered field ${tracked.fieldOpid}: "${question}"`,
      );

      userEntered.push({
        fieldOpid: tracked.fieldOpid,
        formOpid: tracked.formOpid,
        question,
        answer: tracked.value,
        timestamp: tracked.timestamp,
        wasAIFilled: false,
        fieldMetadata: {
          type: tracked.metadata.fieldType,
          purpose: tracked.metadata.fieldPurpose,
          labels: this.extractAllLabels(tracked.metadata),
          placeholder: tracked.metadata.placeholder || undefined,
          required: tracked.metadata.required,
        },
      });
    }

    return userEntered;
  }

  private isTrackableFieldType(fieldType: string): boolean {
    return isTrackableFieldType(fieldType);
  }

  private extractQuestion(
    metadata: TrackedFieldData["metadata"],
  ): string | null {
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

    return null;
  }

  private extractAllLabels(metadata: TrackedFieldData["metadata"]): string[] {
    const allLabels = [
      metadata.labelTag,
      metadata.labelAria,
      metadata.labelData,
      metadata.labelLeft,
      metadata.labelTop,
    ].filter((label): label is string => Boolean(label?.trim()));

    return Array.from(new Set(allLabels));
  }
}
