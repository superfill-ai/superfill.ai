import { describe, expect, test } from "bun:test";
import {
  emptyCDPFillSummary,
  mergeCDPFillSummary,
  planCDPFill,
} from "@/lib/autofill/cdp-fill-planning";
import { mapCDPFillOutcome } from "@/lib/autofill/fill-routing";
import {
  compressNormalizedField,
  normalizeCDPField,
} from "@/lib/autofill/normalized-field";
import type { CDPDetectedField } from "@/types/autofill";

describe("CDP field pipeline", () => {
  test("normalizes mixed CDP metadata before planning fill outcomes", () => {
    const withMetadata = buildCDPField("cdp-first", {
      domMetadata: {
        ...baseDOMMetadata,
        autocomplete: "section-blue shipping given-name",
        htmlName: "first",
        labelText: "First name",
      },
      name: "first",
    });
    const withoutMetadata = buildCDPField("cdp-email", {
      description: "Work email",
      name: "Email",
      value: "mi@example.com",
    });

    const compressed = [withMetadata, withoutMetadata].map((field) =>
      compressNormalizedField(normalizeCDPField(field)),
    );
    const plan = planCDPFill([
      { cdpField: withMetadata, fieldOpid: withMetadata.opid, value: "Ada" },
      {
        cdpField: withoutMetadata,
        fieldOpid: withoutMetadata.opid,
        value: "mi@example.com",
      },
      { fieldOpid: "cdp-missing", value: "Hidden" },
    ]);

    expect(compressed[0]?.autocompleteTokens).toEqual([
      "section-blue",
      "shipping",
      "given-name",
    ]);
    expect(compressed[0]?.purpose).toBe("name.first");
    expect(compressed[1]?.labels).toContain("Work email");
    expect(plan.mappings.map((mapping) => mapping.field.opid)).toEqual([
      "cdp-first",
      "cdp-email",
    ]);
    expect(plan.missingOutcomes).toHaveLength(1);
  });

  test("maps real CDP fill outcomes to sanitized public field outcomes", () => {
    const publicOutcome = mapCDPFillOutcome({
      actualValue: "secret",
      attempts: 1,
      backendNodeId: 1,
      fieldOpid: "cdp-secret",
      reason: "Non-boolean fill value for checkbox-like field",
      requestedValue: "secret",
      role: "checkbox",
      status: "failed",
      verified: false,
    });

    expect(String(publicOutcome.fieldOpid)).toBe("cdp-secret");
    expect(publicOutcome.reason).toBe(
      "Non-boolean fill value for checkbox-like field",
    );
    expect(publicOutcome.status).toBe("failed");
    expect(publicOutcome.verified).toBe(false);
    expect("requestedValue" in publicOutcome).toBe(false);
    expect("actualValue" in publicOutcome).toBe(false);
  });

  test("merges mixed CDP metadata failures into failed summaries", () => {
    const plan = planCDPFill([{ fieldOpid: "cdp-missing", value: "Hidden" }]);
    const summary = mergeCDPFillSummary(
      emptyCDPFillSummary,
      plan.missingOutcomes,
    );

    expect(summary).toMatchObject({
      failed: 1,
      succeeded: 0,
      total: 1,
      verified: 0,
    });
  });
});

const baseDOMMetadata = {
  ariaDescribedByText: null,
  autocomplete: null,
  cssSelector: null,
  formAction: null,
  formName: null,
  helperText: null,
  htmlId: null,
  htmlName: null,
  inputType: "text",
  isContentEditable: false,
  isShadowHost: false,
  isTopElement: true,
  isVisible: true,
  labelText: null,
  maxLength: null,
  placeholder: null,
  tagName: "input",
};

function buildCDPField(
  opid: string,
  overrides: Partial<CDPDetectedField> = {},
): CDPDetectedField {
  return {
    backendNodeId: 1,
    description: "",
    disabled: false,
    highlightIndex: 0,
    name: "",
    opid,
    rect: { height: 10, width: 100, x: 0, y: 0 },
    required: false,
    role: "textbox",
    value: "",
    ...overrides,
  };
}
