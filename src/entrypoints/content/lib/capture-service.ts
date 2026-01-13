import { isTrackableFieldType } from "@/lib/copies";
import { createLogger } from "@/lib/logger";
import type {
  CapturedFieldData,
  DetectedField,
  DetectedForm,
  FieldMapping,
  FieldOpId,
  FormOpId,
  TrackedFieldData,
} from "@/types/autofill";
import type { FieldDataTracker } from "./field-data-tracker";
import type { FormDetector } from "./form-detector";
import { cacheDetectedForms, serializeForms } from "./iframe-handler";

const logger = createLogger("capture-service");

export class CaptureService {
  private mutationObserver: MutationObserver | null = null;
  private formDetector: FormDetector | null = null;
  private fieldTracker: FieldDataTracker | null = null;
  private formCache: Map<FormOpId, DetectedForm> | null = null;
  private fieldCache: Map<FieldOpId, DetectedField> | null = null;
  private sessionId: string | null = null;
  private lastFormCount = 0;

  initializeAutoTracking = async (
    formDetector: FormDetector,
    fieldTracker: FieldDataTracker,
    formCache: Map<FormOpId, DetectedForm>,
    fieldCache: Map<FieldOpId, DetectedField>,
  ) => {
    this.formDetector = formDetector;
    this.fieldTracker = fieldTracker;
    this.formCache = formCache;
    this.fieldCache = fieldCache;

    try {
      const allForms = formDetector.detectAll();
      logger.debug(`Detected ${allForms.length} forms`);

      this.sessionId = crypto.randomUUID();
      await fieldTracker.startTracking(
        window.location.href,
        document.title,
        this.sessionId,
      );

      if (allForms.length === 0) {
        logger.debug(
          "No forms detected initially, setting up mutation observer for dynamic forms...",
        );
        this.startMutationObserver();
        return;
      }

      this.lastFormCount = allForms.length;
      this.attachFieldListeners(allForms);

      logger.debug(`Auto-tracking initialized: ${allForms.length} forms`);

      this.startMutationObserver();
    } catch (error) {
      logger.error("Failed to initialize auto-tracking:", error);
    }
  };

  private attachFieldListeners(allForms: DetectedForm[]): void {
    if (!this.formCache || !this.fieldCache || !this.fieldTracker) return;

    cacheDetectedForms(allForms, this.formCache, this.fieldCache);
    const serializedFormCache = serializeForms(allForms);

    const emptyMappings = new Map<FieldOpId, FieldMapping>();
    const allSerializedFields = serializedFormCache.flatMap((f) => f.fields);

    logger.debug(`Attaching listeners to ${allSerializedFields.length} fields`);

    this.fieldTracker.attachFieldListeners(allSerializedFields, emptyMappings);

    logger.debug(
      "Auto-tracking listeners attached for form submission capture",
    );
  }

  private startMutationObserver(): void {
    if (this.mutationObserver) {
      return;
    }

    logger.debug("Starting mutation observer for dynamic forms...");

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
                logger.debug("New form element detected:", element.tagName);
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

  private recheckForms = (() => {
    let timeout: number | null = null;

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = window.setTimeout(() => {
        if (!this.formDetector) return;

        const allForms = this.formDetector.detectAll();

        if (allForms.length > this.lastFormCount) {
          logger.debug(
            `New forms detected! ${allForms.length} total (was ${this.lastFormCount})`,
          );
          this.lastFormCount = allForms.length;
          this.attachFieldListeners(allForms);
        }
      }, 500);
    };
  })();

  dispose(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    this.formDetector = null;
    this.fieldTracker = null;

    if (this.formCache) {
      this.formCache.clear();
      this.formCache = null;
    }

    if (this.fieldCache) {
      this.fieldCache.clear();
      this.fieldCache = null;
    }

    this.sessionId = null;
    this.lastFormCount = 0;
  }

  identifyCaptureOpportunities(
    trackedFields: TrackedFieldData[],
  ): CapturedFieldData[] {
    logger.debug(`Processing ${trackedFields.length} tracked fields`);

    const userEntered = this.findUserEnteredFields(trackedFields);
    logger.debug(`Found ${userEntered.length} user-entered fields to capture`);

    return userEntered;
  }

  private findUserEnteredFields(
    trackedFields: TrackedFieldData[],
  ): CapturedFieldData[] {
    const userEntered: CapturedFieldData[] = [];

    for (const tracked of trackedFields) {
      if (tracked.wasAIFilled) {
        logger.debug(`Skipping field ${tracked.fieldOpid}: was AI-filled`);
        continue;
      }

      if (!tracked.value || tracked.value.trim() === "") {
        logger.debug(`Skipping field ${tracked.fieldOpid}: empty value`);
        continue;
      }

      if (!this.isTrackableFieldType(tracked.metadata.fieldType)) {
        logger.debug(
          `Skipping field ${tracked.fieldOpid}: non-trackable type ${tracked.metadata.fieldType}`,
        );
        continue;
      }

      const question = this.extractQuestion(tracked.metadata);
      if (!question) {
        logger.debug(
          `Skipping field ${tracked.fieldOpid}: no question/label extracted`,
        );
        continue;
      }

      logger.debug(
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
