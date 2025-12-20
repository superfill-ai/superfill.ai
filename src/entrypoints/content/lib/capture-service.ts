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
  initializeAutoTracking = async (
    formDetector: FormDetector,
    fieldTracker: FieldDataTracker,
    formCache: Map<FormOpId, DetectedForm>,
    fieldCache: Map<FieldOpId, DetectedField>,
  ) => {
    try {
      const allForms = formDetector.detectAll();

      if (allForms.length === 0) {
        logger.info("No forms detected for auto-tracking");
        return;
      }

      cacheDetectedForms(allForms, formCache, fieldCache);
      const serializedFormCache = serializeForms(allForms);
      const totalFields = allForms.reduce(
        (sum, form) => sum + form.fields.length,
        0,
      );

      logger.info(
        `Auto-tracking initialized: ${allForms.length} forms, ${totalFields} fields`,
      );

      const sessionId = crypto.randomUUID();

      await fieldTracker.startTracking(
        window.location.href,
        document.title,
        sessionId,
      );

      const emptyMappings = new Map<FieldOpId, FieldMapping>();
      fieldTracker.attachFieldListeners(
        serializedFormCache.flatMap((f) => f.fields),
        emptyMappings,
      );

      logger.info(
        "Auto-tracking listeners attached for form submission capture",
      );
    } catch (error) {
      logger.error("Failed to initialize auto-tracking:", error);
    }
  };

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
