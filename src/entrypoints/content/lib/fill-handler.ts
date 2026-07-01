import type { DomFillResult } from "@/entrypoints/content/lib/dom-fill-result";
import { fillDomElement } from "@/entrypoints/content/lib/dom-fill-verification";
import {
  buildFillFieldsResult,
  buildSkippedFieldOutcome,
  FIELD_NOT_IN_CACHE_REASON,
} from "@/lib/autofill/fill-routing";
import { createLogger } from "@/lib/logger";
import type {
  DetectedField,
  FieldFillOutcome,
  FieldOpId,
  FieldsToFillData,
  FillFieldsResult,
} from "@/types/autofill";

const logger = createLogger("fill-handler");
const FIELD_DETACHED_REASON = "Field is no longer connected to the DOM";

const isFieldConnected = (field: DetectedField): boolean =>
  field.element.isConnected;

const getFillOutcomeStatus = (result: DomFillResult): "failed" | "skipped" => {
  if (result.attempted) {
    return "failed";
  }

  return "skipped";
};

const buildFillOutcome = (
  fieldOpid: FieldOpId,
  result: DomFillResult,
): FieldFillOutcome => {
  if (result.verified) {
    return {
      fieldOpid,
      status: "filled",
      verified: true,
    };
  }

  return {
    fieldOpid,
    reason: result.reason ?? "DOM fill could not be verified",
    status: getFillOutcomeStatus(result),
    verified: false,
  };
};

const logFillOutcome = (outcome: FieldFillOutcome): void => {
  switch (outcome.status) {
    case "filled":
      logger.info(`Verified fill for field ${outcome.fieldOpid}`);
      return;
    case "failed":
      logger.warn(
        `Failed to verify fill for field ${outcome.fieldOpid}: ${outcome.reason}`,
      );
      return;
    case "skipped":
      logger.warn(`Skipped field ${outcome.fieldOpid}: ${outcome.reason}`);
      return;
  }
};

export const handleFill = async (
  fieldsToFill: FieldsToFillData,
  frameInfo: { isMainFrame: boolean },
  formDetectionService: {
    getCachedField: (opid: FieldOpId) => DetectedField | null;
  },
): Promise<FillFieldsResult> => {
  logger.info(
    `Filling ${fieldsToFill.length} fields in ${frameInfo.isMainFrame ? "main frame" : "iframe"}`,
  );

  const outcomes: FieldFillOutcome[] = [];

  for (const { fieldOpid, value } of fieldsToFill) {
    const field = formDetectionService.getCachedField(fieldOpid);

    if (!field) {
      const outcome = buildSkippedFieldOutcome(
        fieldOpid,
        FIELD_NOT_IN_CACHE_REASON,
      );
      outcomes.push(outcome);
      logFillOutcome(outcome);
      continue;
    }

    if (!isFieldConnected(field)) {
      const outcome = buildSkippedFieldOutcome(
        fieldOpid,
        FIELD_DETACHED_REASON,
      );
      outcomes.push(outcome);
      logFillOutcome(outcome);
      continue;
    }

    const result = await fillDomElement(field.element, value);
    const outcome = buildFillOutcome(fieldOpid, result);

    outcomes.push(outcome);
    logFillOutcome(outcome);
  }

  const summary = buildFillFieldsResult(outcomes);
  logger.info(
    `Fill completed: ${summary.succeeded} verified, ${summary.failed} failed, ${summary.skipped} skipped`,
  );
  return summary;
};
