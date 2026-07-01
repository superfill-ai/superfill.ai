import { createLogger } from "@/lib/logger";
import type { FormFieldElement } from "@/types/autofill";
import {
  fillCheckableInput,
  getCheckableActualValue,
  getRadioGroupActualValue,
} from "./dom-fill-checkable";
import { buildDomFillResult, type DomFillResult } from "./dom-fill-result";
import {
  fillReactSelect,
  fillWithHumanTyping,
  fillWithNativeSetter,
  normalizeFillValue,
  type TextFieldElement,
} from "./dom-fill-strategies";

const logger = createLogger("fill-handler");

const verifyTextValue = (
  element: TextFieldElement,
  requestedValue: string,
): DomFillResult => {
  const actualValue = element.value;

  if (actualValue === requestedValue) {
    return buildDomFillResult(true, true, actualValue);
  }

  return buildDomFillResult(
    true,
    false,
    actualValue,
    "DOM text value did not match requested value",
  );
};

const fillTextElement = async (
  element: TextFieldElement,
  value: string,
): Promise<DomFillResult> => {
  element.focus({ preventScroll: true });

  if (
    element instanceof HTMLInputElement &&
    element.getAttribute("role") === "combobox"
  ) {
    const reactSelectAttempted = await fillReactSelect(element, value);
    const result = verifyTextValue(element, value);

    if (reactSelectAttempted) {
      return result;
    }

    return buildDomFillResult(
      true,
      false,
      result.actualValue,
      "React Select fill attempt failed",
    );
  }

  const success = await fillWithHumanTyping(element, value);
  if (!success) {
    fillWithNativeSetter(element, value);
  }

  return verifyTextValue(element, value);
};

const fillSelectElement = (element: HTMLSelectElement, value: string): void => {
  const normalizedValue = normalizeFillValue(value);
  let matched = false;

  for (const option of Array.from(element.options)) {
    if (
      normalizeFillValue(option.value) === normalizedValue ||
      normalizeFillValue(option.text) === normalizedValue
    ) {
      option.selected = true;
      matched = true;
      break;
    }
  }

  if (!matched) {
    logger.warn(
      `Select element ${element.name || element.id || "(unnamed)"} has no option matching requested value. Setting value directly.`,
    );
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const verifySelectValue = (
  element: HTMLSelectElement,
  requestedValue: string,
): DomFillResult => {
  const actualValue = element.value;
  const normalizedRequestedValue = normalizeFillValue(requestedValue);
  const selectedOption = element.selectedOptions.item(0);

  if (
    normalizeFillValue(actualValue) === normalizedRequestedValue ||
    normalizeFillValue(selectedOption?.text ?? "") === normalizedRequestedValue
  ) {
    return buildDomFillResult(true, true, actualValue);
  }

  return buildDomFillResult(
    true,
    false,
    actualValue,
    "DOM select value did not match requested value or option text",
  );
};

const readActualElementValue = (element: FormFieldElement): string => {
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    return getCheckableActualValue(element);
  }

  if (element instanceof HTMLInputElement && element.type === "radio") {
    return getRadioGroupActualValue(element);
  }

  return element.value;
};

export const fillDomElement = async (
  element: FormFieldElement,
  value: string,
): Promise<DomFillResult> => {
  try {
    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" || element.type === "radio") {
        return fillCheckableInput(element, value);
      }

      return fillTextElement(element, value);
    }

    if (element instanceof HTMLTextAreaElement) {
      return fillTextElement(element, value);
    }

    fillSelectElement(element, value);
    return verifySelectValue(element, value);
  } catch (error) {
    if (error instanceof Error) {
      return buildDomFillResult(
        true,
        false,
        readActualElementValue(element),
        error.message,
      );
    }

    return buildDomFillResult(
      true,
      false,
      readActualElementValue(element),
      "Unknown DOM fill error",
    );
  }
};
