import type {
  CDPDetectedField,
  CDPFieldMapping,
  CDPFillOutcome,
  CDPFillSummary,
} from "@/types/autofill";

export type CDPFillRequest = {
  readonly fieldOpid: string;
  readonly value: string;
  readonly cdpField?: CDPDetectedField;
};

export type PlannedCDPFill = {
  readonly mappings: CDPFieldMapping[];
  readonly missingOutcomes: CDPFillOutcome[];
};

const buildMissingMetadataOutcome = (
  request: CDPFillRequest,
): CDPFillOutcome => ({
  attempts: 0,
  backendNodeId: 0,
  fieldOpid: request.fieldOpid,
  reason: "Missing CDP field metadata",
  requestedValue: request.value,
  role: request.cdpField?.role ?? "textbox",
  status: "failed",
  verified: false,
});

export const planCDPFill = (
  requests: readonly CDPFillRequest[],
): PlannedCDPFill => {
  const mappings: CDPFieldMapping[] = [];
  const missingOutcomes: CDPFillOutcome[] = [];

  for (const request of requests) {
    if (!request.cdpField) {
      missingOutcomes.push(buildMissingMetadataOutcome(request));
      continue;
    }

    mappings.push({
      confidence: 1,
      field: request.cdpField,
      value: request.value,
    });
  }

  return { mappings, missingOutcomes };
};

export const mergeCDPFillSummary = (
  summary: CDPFillSummary,
  extraOutcomes: readonly CDPFillOutcome[],
): CDPFillSummary => {
  const outcomes = [...summary.outcomes, ...extraOutcomes];

  return {
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    outcomes,
    recovered: outcomes.filter((outcome) => outcome.status === "recovered")
      .length,
    succeeded: outcomes.filter((outcome) => outcome.status !== "failed").length,
    total: outcomes.length,
    verified: outcomes.filter((outcome) => outcome.verified).length,
  };
};

export const emptyCDPFillSummary: CDPFillSummary = {
  failed: 0,
  outcomes: [],
  recovered: 0,
  succeeded: 0,
  total: 0,
  verified: 0,
};
