import { describe, expect, test } from "bun:test";
import {
  buildFillFieldsResult,
  buildSkippedFieldOutcome,
  partitionFieldsByFrame,
} from "@/lib/autofill/fill-routing";
import type { FieldOpId, FieldsToFillData } from "@/types/autofill";

describe("fill routing", () => {
  test("partitions fill payloads by target frame without leaking sibling values", () => {
    const fields: FieldsToFillData = [
      {
        fieldOpid: "__frame_main_test__field_0" as FieldOpId,
        frameId: 0,
        value: "main-secret",
      },
      {
        fieldOpid: "__frame_child_test__field_1" as FieldOpId,
        frameId: 7,
        value: "child-secret",
      },
    ];

    const targets = partitionFieldsByFrame(fields);

    expect(targets).toHaveLength(2);
    expect(targets.find((target) => target.frameId === 0)?.fields).toEqual([
      fields[0],
    ]);
    expect(targets.find((target) => target.frameId === 7)?.fields).toEqual([
      fields[1],
    ]);
  });

  test("returns sanitized fill outcomes without requested or actual values", () => {
    const fieldOpid = "__frame_main_test__field_0" as FieldOpId;
    const outcome = buildSkippedFieldOutcome(
      fieldOpid,
      "Field was not in the detection cache",
    );
    const result = buildFillFieldsResult([outcome]);

    expect(result.ok).toBe(false);
    expect(result.outcomes[0]).toEqual({
      fieldOpid,
      reason: "Field was not in the detection cache",
      status: "skipped",
      verified: false,
    });
    expect("requestedValue" in outcome).toBe(false);
    expect("actualValue" in outcome).toBe(false);
  });
});
