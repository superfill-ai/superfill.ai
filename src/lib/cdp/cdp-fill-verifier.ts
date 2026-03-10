import type { CDPDetectedField, CDPFieldRole } from "@/types/autofill";
import { sendCommand } from "./cdp-service";

interface ResolveNodeResponse {
  object?: { objectId?: string };
}

interface RuntimeCallResponse<T = unknown> {
  result?: { value?: T };
}

type FieldSnapshot = {
  value: string;
  textContent: string;
  selectedText: string;
  checked: boolean | null;
  tagName: string;
  inputType: string | null;
  ariaValueNow: string | null;
};

export interface FillVerificationResult {
  verified: boolean;
  actualValue?: string;
  reason?: string;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function valuesMatch(actual: string, expected: string): boolean {
  const actualNorm = normalize(actual);
  const expectedNorm = normalize(expected);
  if (!expectedNorm) return actualNorm.length === 0;
  if (actualNorm === expectedNorm) return true;
  return actualNorm.includes(expectedNorm) || expectedNorm.includes(actualNorm);
}

export function parseBooleanLike(value: string): boolean | null {
  const normalized = normalize(value);
  if (["true", "1", "yes", "y", "on", "checked"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "off", "unchecked"].includes(normalized)) {
    return false;
  }
  return null;
}

async function readNodeSnapshot(
  tabId: number,
  backendNodeId: number,
): Promise<FieldSnapshot | null> {
  try {
    const resolved = await sendCommand<ResolveNodeResponse>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );
    const objectId = resolved?.object?.objectId;
    if (!objectId) return null;

    const snapshot = await sendCommand<RuntimeCallResponse<FieldSnapshot>>(
      tabId,
      "Runtime.callFunctionOn",
      {
        objectId,
        functionDeclaration: `function() {
          const el = this;
          const tagName = (el.tagName || "").toLowerCase();
          const textContent = (el.textContent || "").trim();
          const value =
            typeof el.value === "string"
              ? el.value
              : (el.getAttribute?.("value") || "");
          const checked =
            typeof el.checked === "boolean"
              ? el.checked
              : (el.getAttribute?.("aria-checked") === "true" ? true : null);

          let selectedText = "";
          if (el instanceof HTMLSelectElement) {
            selectedText = el.selectedOptions?.[0]?.textContent?.trim() || "";
          } else {
            const selected =
              (el.querySelector && el.querySelector('[aria-selected="true"], [selected]')) ||
              null;
            selectedText = selected?.textContent?.trim() || "";
          }

          return {
            value: String(value ?? ""),
            textContent: String(textContent ?? ""),
            selectedText: String(selectedText ?? ""),
            checked: checked === true ? true : checked === false ? false : null,
            tagName,
            inputType: el.getAttribute?.("type") || null,
            ariaValueNow: el.getAttribute?.("aria-valuenow") || null
          };
        }`,
        returnByValue: true,
      },
    );

    return snapshot?.result?.value ?? null;
  } catch {
    return null;
  }
}

export async function readCheckedState(
  tabId: number,
  backendNodeId: number,
): Promise<boolean | null> {
  const snapshot = await readNodeSnapshot(tabId, backendNodeId);
  return snapshot?.checked ?? null;
}

async function verifyRadioGroup(
  tabId: number,
  field: CDPDetectedField,
  expectedValue: string,
): Promise<FillVerificationResult> {
  const expected = normalize(expectedValue);
  const radioOptions = field.radioOptions ?? [];
  let selectedValue = "";

  for (const option of radioOptions) {
    const checked = await readCheckedState(tabId, option.backendNodeId);
    if (checked) {
      selectedValue = option.value || option.label;
      break;
    }
  }

  if (!selectedValue && radioOptions.length > 0) {
    const firstSnapshot = await readNodeSnapshot(
      tabId,
      radioOptions[0].backendNodeId,
    );
    selectedValue = firstSnapshot?.value || "";
  }

  return {
    verified: valuesMatch(selectedValue, expected),
    actualValue: selectedValue,
    reason: selectedValue
      ? undefined
      : "Could not determine selected radio option",
  };
}

function verifyByRole(
  role: CDPFieldRole,
  expectedValue: string,
  snapshot: FieldSnapshot,
): FillVerificationResult {
  const expectedBool = parseBooleanLike(expectedValue);

  switch (role) {
    case "checkbox":
    case "switch":
    case "menuitemcheckbox": {
      if (expectedBool === null) {
        return {
          verified: false,
          actualValue: String(snapshot.checked),
          reason: `Non-boolean value "${expectedValue}" for checkbox-like field`,
        };
      }
      const isChecked = snapshot.checked === true;
      return {
        verified: isChecked === expectedBool,
        actualValue: String(isChecked),
      };
    }
    case "combobox":
    case "listbox": {
      const actual =
        snapshot.selectedText || snapshot.value || snapshot.textContent;
      return {
        verified: valuesMatch(actual, expectedValue),
        actualValue: actual,
      };
    }
    case "slider":
    case "spinbutton": {
      const actual = snapshot.ariaValueNow || snapshot.value;
      return {
        verified: valuesMatch(actual, expectedValue),
        actualValue: actual,
      };
    }
    default: {
      const actual = snapshot.value || snapshot.textContent;
      return {
        verified: valuesMatch(actual, expectedValue),
        actualValue: actual,
      };
    }
  }
}

export async function verifyFilledField(
  tabId: number,
  field: CDPDetectedField,
  expectedValue: string,
  backendNodeId: number,
): Promise<FillVerificationResult> {
  if (field.role === "radiogroup") {
    return verifyRadioGroup(tabId, field, expectedValue);
  }

  const snapshot = await readNodeSnapshot(tabId, backendNodeId);
  if (!snapshot) {
    return {
      verified: false,
      reason: "Unable to read node state for verification",
    };
  }

  if (field.domMetadata?.isContentEditable) {
    const actual = snapshot.textContent || snapshot.value;
    return {
      verified: valuesMatch(actual, expectedValue),
      actualValue: actual,
    };
  }

  return verifyByRole(field.role, expectedValue, snapshot);
}
