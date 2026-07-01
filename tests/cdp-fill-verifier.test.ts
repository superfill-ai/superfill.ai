import { describe, expect, test } from "bun:test";
import { verifySnapshotByRole } from "@/lib/cdp/cdp-fill-verifier";

describe("CDP fill verification", () => {
  test("verifies checkbox-like roles from checked state", () => {
    expect(
      verifySnapshotByRole("checkbox", "true", buildSnapshot({ checked: true }))
        .verified,
    ).toBe(true);
    expect(
      verifySnapshotByRole("switch", "false", buildSnapshot({ checked: true }))
        .verified,
    ).toBe(false);
    expect(
      verifySnapshotByRole(
        "checkbox",
        "secret",
        buildSnapshot({ checked: false }),
      ).reason,
    ).toBe("Non-boolean fill value for checkbox-like field");
  });

  test("verifies select-like and numeric roles from role-specific values", () => {
    expect(
      verifySnapshotByRole(
        "combobox",
        "United States",
        buildSnapshot({ selectedText: "United States" }),
      ).verified,
    ).toBe(true);
    expect(
      verifySnapshotByRole(
        "slider",
        "75",
        buildSnapshot({ ariaValueNow: "75", value: "20" }),
      ).verified,
    ).toBe(true);
  });

  test("verifies content text roles from value or text content", () => {
    expect(
      verifySnapshotByRole(
        "textbox",
        "Ada Lovelace",
        buildSnapshot({ value: "Ada Lovelace" }),
      ).verified,
    ).toBe(true);
    expect(
      verifySnapshotByRole(
        "textarea",
        "profile summary",
        buildSnapshot({ textContent: "Profile summary" }),
      ).verified,
    ).toBe(true);
  });
});

function buildSnapshot(
  overrides: Partial<{
    value: string;
    textContent: string;
    selectedText: string;
    checked: boolean | null;
    tagName: string;
    inputType: string | null;
    ariaValueNow: string | null;
  }>,
) {
  return {
    ariaValueNow: null,
    checked: null,
    inputType: null,
    selectedText: "",
    tagName: "input",
    textContent: "",
    value: "",
    ...overrides,
  };
}
