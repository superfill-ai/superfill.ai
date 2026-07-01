import { describe, expect, test } from "bun:test";
import { isConsentLikeChoiceField } from "@/lib/autofill/autofill-safety";
import type {
  DetectedFieldSnapshot,
  FieldOpId,
  FieldPurpose,
  FieldType,
  FormOpId,
} from "@/types/autofill";

describe("autofill safety", () => {
  test("treats broad legal and marketing choice wording as consent-like", () => {
    const labels = [
      "Accept the Terms of Service",
      "Opt in to product communications",
      "Keep me informed about updates",
      "Allow promotional messages",
      "Send me marketing emails",
      "Sign me up for offers",
      "I would like to receive emails from partners",
      "Contact me about offers",
      "Yes, send SMS alerts",
    ];

    for (const label of labels) {
      expect(
        isConsentLikeChoiceField(buildChoiceField(label, "checkbox")),
      ).toBe(true);
    }
  });

  test("does not treat ordinary non-consent choice fields as consent-like", () => {
    expect(
      isConsentLikeChoiceField(
        buildChoiceField("Contact me by phone", "radio"),
      ),
    ).toBe(false);
  });

  test("ignores consent-like wording on non-choice fields", () => {
    expect(
      isConsentLikeChoiceField(buildChoiceField("Accept text", "text")),
    ).toBe(false);
  });
});

function buildChoiceField(
  label: string,
  fieldType: FieldType,
): DetectedFieldSnapshot {
  return {
    opid: "__frame_main_test__field_0" as FieldOpId,
    formOpid: "__form__test" as FormOpId,
    highlightIndex: 0,
    metadata: {
      id: null,
      name: null,
      className: null,
      type: fieldType,
      labelTag: label,
      labelData: null,
      labelAria: null,
      labelLeft: null,
      labelTop: null,
      placeholder: null,
      helperText: null,
      autocomplete: null,
      required: false,
      disabled: false,
      readonly: false,
      maxLength: null,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      currentValue: "",
      fieldType,
      fieldPurpose: "unknown" satisfies FieldPurpose,
      isVisible: true,
      isTopElement: true,
      isInteractive: true,
    },
  };
}
