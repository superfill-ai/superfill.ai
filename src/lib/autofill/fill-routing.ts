import type {
  CDPFillOutcome,
  FieldFillOutcome,
  FieldOpId,
  FieldsToFillData,
  FillFieldsResult,
} from "@/types/autofill";

export const FIELD_NOT_IN_CACHE_REASON = "Field was not in the detection cache";

export type FrameFillTarget = {
  readonly frameId: number;
  readonly fields: FieldsToFillData;
};

export const buildFillFieldsResult = (
  outcomes: readonly FieldFillOutcome[],
): FillFieldsResult => {
  const succeeded = outcomes.filter(
    (outcome) => outcome.status === "filled",
  ).length;
  const failed = outcomes.filter(
    (outcome) => outcome.status === "failed",
  ).length;
  const skipped = outcomes.filter(
    (outcome) => outcome.status === "skipped",
  ).length;

  return {
    failed,
    ok: failed === 0 && skipped === 0,
    outcomes,
    skipped,
    succeeded,
  };
};

export const buildSkippedFieldOutcome = (
  fieldOpid: FieldOpId,
  reason: string,
): FieldFillOutcome => ({
  fieldOpid,
  reason,
  status: "skipped",
  verified: false,
});

export const mapCDPFillOutcome = (
  outcome: CDPFillOutcome,
): FieldFillOutcome => {
  if (outcome.status !== "failed" && outcome.verified) {
    return {
      fieldOpid: outcome.fieldOpid as FieldOpId,
      status: "filled",
      verified: true,
    };
  }

  return {
    fieldOpid: outcome.fieldOpid as FieldOpId,
    reason: outcome.reason ?? "CDP fill could not be verified",
    status: "failed",
    verified: false,
  };
};

const chooseAuthoritativeDomOutcome = (
  fieldOpid: FieldOpId,
  outcomes: readonly FieldFillOutcome[],
): FieldFillOutcome => {
  const filled = outcomes.find((outcome) => outcome.status === "filled");
  if (filled) {
    return filled;
  }

  const failed = outcomes.find((outcome) => outcome.status === "failed");
  if (failed) {
    return failed;
  }

  const fieldSpecificSkip = outcomes.find(
    (outcome) => outcome.reason !== FIELD_NOT_IN_CACHE_REASON,
  );
  if (fieldSpecificSkip) {
    return fieldSpecificSkip;
  }

  return (
    outcomes[0] ??
    buildSkippedFieldOutcome(fieldOpid, "Field was not found in any frame")
  );
};

export const collapseFrameFillResults = (
  requestedFields: FieldsToFillData,
  frameResults: readonly FillFieldsResult[],
): FillFieldsResult => {
  const allOutcomes = frameResults.flatMap((result) => result.outcomes);
  const authoritativeOutcomes = requestedFields.map((field) =>
    chooseAuthoritativeDomOutcome(
      field.fieldOpid,
      allOutcomes.filter((outcome) => outcome.fieldOpid === field.fieldOpid),
    ),
  );

  return buildFillFieldsResult(authoritativeOutcomes);
};

const getTargetFrameId = (field: FieldsToFillData[number]): number => {
  if (typeof field.frameId === "number") {
    return field.frameId;
  }

  return 0;
};

export const partitionFieldsByFrame = (
  fields: FieldsToFillData,
): FrameFillTarget[] => {
  const fieldsByFrame = new Map<number, FieldsToFillData>();

  for (const field of fields) {
    const frameId = getTargetFrameId(field);
    const bucket = fieldsByFrame.get(frameId) ?? [];
    bucket.push(field);
    fieldsByFrame.set(frameId, bucket);
  }

  return Array.from(fieldsByFrame, ([frameId, frameFields]) => ({
    fields: frameFields,
    frameId,
  }));
};
