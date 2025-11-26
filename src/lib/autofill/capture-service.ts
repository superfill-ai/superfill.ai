import type {
  CapturedFieldData,
  DetectedFieldSnapshot,
  FieldMapping,
  FieldOpId,
  TrackedFieldData,
} from "@/types/autofill";
import { createLogger } from "@/lib/logger";

const logger = createLogger("capture-service");

const MAX_UNFILLED_FIELDS = 10;

interface CaptureFilter {
  includeUnfilled: boolean;
  includeModified: boolean;
  confidenceThreshold: number;
}

export class CaptureService {
  identifyCaptureOpportunities(
    trackedFields: TrackedFieldData[],
    allFields: DetectedFieldSnapshot[],
    mappings: Map<FieldOpId, FieldMapping>,
    filter: CaptureFilter,
  ): CapturedFieldData[] {
    const captured: CapturedFieldData[] = [];

    if (filter.includeModified) {
      const modified = this.findModifiedFields(trackedFields);
      captured.push(...modified);
      logger.info(`Found ${modified.length} modified fields`);
    }

    if (filter.includeUnfilled) {
      const unfilled = this.findUnfilledFields(
        allFields,
        mappings,
        trackedFields,
        filter.confidenceThreshold,
      );
      captured.push(...unfilled);
      logger.info(`Found ${unfilled.length} unfilled fields`);
    }

    const deduplicated = this.deduplicateFields(captured);
    logger.info(
      `Captured ${deduplicated.length} fields after deduplication`,
    );

    return deduplicated;
  }

  private findModifiedFields(
    trackedFields: TrackedFieldData[],
  ): CapturedFieldData[] {
    const modified: CapturedFieldData[] = [];

    for (const tracked of trackedFields) {
      if (
        !tracked.wasAIFilled ||
        !tracked.originalAIValue ||
        tracked.value === tracked.originalAIValue
      ) {
        continue;
      }

      const question = this.extractQuestion(tracked.metadata);
      if (!question) continue;

      modified.push({
        fieldOpid: tracked.fieldOpid,
        formOpid: tracked.formOpid,
        question,
        answer: tracked.value,
        timestamp: tracked.timestamp,
        wasAIFilled: true,
        originalAIValue: tracked.originalAIValue,
        aiMemoryId: tracked.aiMemoryId,
        aiConfidence: tracked.aiConfidence,
        fieldMetadata: {
          type: tracked.metadata.fieldType,
          purpose: tracked.metadata.fieldPurpose,
          labels: this.extractAllLabels(tracked.metadata),
          placeholder: tracked.metadata.placeholder || undefined,
          required: tracked.metadata.required,
        },
      });
    }

    return modified;
  }

  private findUnfilledFields(
    allFields: DetectedFieldSnapshot[],
    mappings: Map<FieldOpId, FieldMapping>,
    trackedFields: TrackedFieldData[],
    confidenceThreshold: number,
  ): CapturedFieldData[] {
    const trackedOpids = new Set(
      trackedFields.map((f) => f.fieldOpid),
    );
    const unfilled: CapturedFieldData[] = [];

    for (const field of allFields) {
      if (trackedOpids.has(field.opid)) continue;

      if (!this.isVisibleField(field)) continue;

      if (!this.isTrackableFieldType(field.metadata.fieldType)) continue;

      const mapping = mappings.get(field.opid);

      const isUnfilled =
        !mapping ||
        mapping.memoryId === null ||
        mapping.confidence < confidenceThreshold;

      if (!isUnfilled) continue;

      const question = this.extractQuestion(field.metadata);
      if (!question) continue;

      unfilled.push({
        fieldOpid: field.opid,
        formOpid: field.formOpid,
        question,
        answer: "", // No answer since it's unfilled
        timestamp: Date.now(),
        wasAIFilled: false,
        aiConfidence: mapping?.confidence,
        fieldMetadata: {
          type: field.metadata.fieldType,
          purpose: field.metadata.fieldPurpose,
          labels: this.extractAllLabels(field.metadata),
          placeholder: field.metadata.placeholder || undefined,
          required: field.metadata.required,
        },
      });

      if (unfilled.length >= MAX_UNFILLED_FIELDS) {
        logger.info(`Reached max unfilled fields limit: ${MAX_UNFILLED_FIELDS}`);
        break;
      }
    }

    return unfilled;
  }

  private isVisibleField(field: DetectedFieldSnapshot): boolean {
    const rect = field.metadata.rect;

    if (!rect || rect.width === 0 || rect.height === 0) {
      return false;
    }

    return true;
  }

  private isTrackableFieldType(fieldType: string): boolean {
    return (
      fieldType === "text" ||
      fieldType === "email" ||
      fieldType === "tel" ||
      fieldType === "textarea" ||
      fieldType === "url"
    );
  }

  private extractQuestion(
    metadata: DetectedFieldSnapshot["metadata"],
  ): string | null {
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

    return null;
  }

  private extractAllLabels(
    metadata: DetectedFieldSnapshot["metadata"],
  ): string[] {
    const allLabels = [
      metadata.labelTag,
      metadata.labelAria,
      metadata.labelData,
      metadata.labelLeft,
      metadata.labelRight,
      metadata.labelTop,
    ].filter((label): label is string => Boolean(label?.trim()));

    return Array.from(new Set(allLabels));
  }

  private deduplicateFields(
    fields: CapturedFieldData[],
  ): CapturedFieldData[] {
    const seen = new Map<string, CapturedFieldData>();

    for (const field of fields) {
      const normalizedQuestion = this.normalizeQuestion(field.question);
      const key = `${normalizedQuestion}`;

      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, field);
        continue;
      }

      if (field.wasAIFilled && !existing.wasAIFilled) {
        seen.set(key, field);
        continue;
      }

      if (field.answer.length > existing.answer.length) {
        seen.set(key, field);
      }
    }

    return Array.from(seen.values());
  }

  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
