import { describe, expect, test } from "bun:test";
import {
  emptyCDPFillSummary,
  mergeCDPFillSummary,
  planCDPFill,
} from "@/lib/autofill/cdp-fill-planning";
import type { CDPDetectedField } from "@/types/autofill";

describe("CDP fill planning", () => {
  test("keeps missing-metadata CDP requests as failed outcomes in mixed batches", () => {
    const validField = buildCDPField("cdp-valid");
    const plan = planCDPFill([
      {
        cdpField: validField,
        fieldOpid: validField.opid,
        value: "Mira",
      },
      {
        fieldOpid: "cdp-missing",
        value: "Hidden",
      },
    ]);

    const summary = mergeCDPFillSummary(
      {
        ...emptyCDPFillSummary,
        outcomes: [
          {
            attempts: 1,
            backendNodeId: 1,
            fieldOpid: "cdp-valid",
            requestedValue: "Mira",
            role: "textbox",
            status: "verified",
            verified: true,
          },
        ],
      },
      plan.missingOutcomes,
    );

    expect(plan.mappings).toHaveLength(1);
    expect(plan.missingOutcomes).toHaveLength(1);
    expect(summary.total).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.succeeded).toBe(1);
    expect(summary.outcomes.map((outcome) => outcome.fieldOpid)).toEqual([
      "cdp-valid",
      "cdp-missing",
    ]);
    expect(summary.outcomes[1]?.status).toBe("failed");
    expect(summary.outcomes[1]?.reason).toBe("Missing CDP field metadata");
  });
});

function buildCDPField(opid: string): CDPDetectedField {
  return {
    backendNodeId: 1,
    description: "",
    disabled: false,
    highlightIndex: 0,
    name: "Name",
    opid,
    rect: { height: 10, width: 100, x: 0, y: 0 },
    required: false,
    role: "textbox",
    value: "",
  };
}
