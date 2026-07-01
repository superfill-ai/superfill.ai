import { describe, expect, test } from "bun:test";
import { normalizeCDPField } from "@/lib/autofill/normalized-field";
import type { CDPDetectedField } from "@/types/autofill";

describe("normalized fields", () => {
  test("uses CDP checked state as the current value for checkbox fields", () => {
    const field: CDPDetectedField = {
      backendNodeId: 1,
      checked: true,
      description: "",
      disabled: false,
      domMetadata: {
        ariaDescribedByText: null,
        autocomplete: null,
        cssSelector: "#updates",
        formAction: null,
        formName: null,
        helperText: null,
        htmlId: "updates",
        htmlName: "updates",
        inputType: "checkbox",
        isContentEditable: false,
        isShadowHost: false,
        isTopElement: true,
        isVisible: true,
        labelText: "Send updates",
        maxLength: null,
        placeholder: null,
        tagName: "input",
      },
      highlightIndex: 0,
      name: "Send updates",
      opid: "cdp-checkbox",
      rect: { height: 10, width: 10, x: 0, y: 0 },
      required: false,
      role: "checkbox",
      value: "on",
    };

    expect(normalizeCDPField(field).currentValue).toBe("true");
  });
});
