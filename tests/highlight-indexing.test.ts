import { describe, expect, test } from "bun:test";
import { assignGlobalHighlightIndices } from "@/lib/autofill/highlight-indexing";
import type {
  DetectedFieldSnapshot,
  DetectedFormSnapshot,
  FieldOpId,
  FormOpId,
} from "@/types/autofill";

describe("highlight indexing", () => {
  test("remaps collected frame fields to globally unique highlight indexes", () => {
    const forms = assignGlobalHighlightIndices([
      buildForm("__form__main", [
        buildField("__frame_main__field_0", 0),
        buildField("__frame_main__field_1", null),
      ]),
      buildForm("__form__child", [
        buildField("__frame_child__field_0", 0),
        buildField("__frame_child__field_1", 1),
      ]),
    ]);

    expect(
      forms.flatMap((form) => form.fields.map((field) => field.highlightIndex)),
    ).toEqual([0, null, 1, 2]);
  });
});

function buildForm(
  opid: string,
  fields: DetectedFieldSnapshot[],
): DetectedFormSnapshot {
  return {
    action: "",
    fields,
    method: "",
    name: "",
    opid: opid as FormOpId,
  };
}

function buildField(
  opid: string,
  highlightIndex: number | null,
): DetectedFieldSnapshot {
  return {
    formOpid: "__form__test" as FormOpId,
    highlightIndex,
    metadata: {
      autocomplete: null,
      className: null,
      currentValue: "",
      disabled: false,
      fieldPurpose: "unknown",
      fieldType: "text",
      helperText: null,
      id: null,
      isInteractive: true,
      isTopElement: true,
      isVisible: true,
      labelAria: null,
      labelData: null,
      labelLeft: null,
      labelTag: null,
      labelTop: null,
      maxLength: null,
      name: null,
      placeholder: null,
      readonly: false,
      rect: { height: 10, width: 100, x: 0, y: 0 },
      required: false,
      type: "input",
    },
    opid: opid as FieldOpId,
  };
}
