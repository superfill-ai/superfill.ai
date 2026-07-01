import { buildDomFillResult, type DomFillResult } from "./dom-fill-result";
import { normalizeFillValue } from "./dom-fill-strategies";

const getRequestedCheckedState = (
  element: HTMLInputElement,
  value: string,
): boolean | null => {
  switch (normalizeFillValue(value)) {
    case "1":
    case "checked":
    case "on":
    case "true":
    case "yes":
      return true;
    case "":
    case "0":
    case "false":
    case "no":
    case "off":
    case "unchecked":
      return false;
  }

  if (normalizeFillValue(element.value) === normalizeFillValue(value)) {
    return true;
  }

  return null;
};

export const getCheckableActualValue = (element: HTMLInputElement): string =>
  element.checked ? "checked" : "unchecked";

const getRadioSearchRoot = (element: HTMLInputElement): ParentNode => {
  const root = element.getRootNode();
  if ("querySelectorAll" in root) {
    return root as ParentNode;
  }

  return document;
};

const getRadioGroupElements = (
  element: HTMLInputElement,
): HTMLInputElement[] => {
  if (element.type !== "radio" || element.name.trim().length === 0) {
    return [element];
  }

  return Array.from(
    getRadioSearchRoot(element).querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    ),
  ).filter(
    (radio) => radio.name === element.name && radio.form === element.form,
  );
};

const getRadioOptionLabel = (element: HTMLInputElement): string | null => {
  for (const label of Array.from(element.labels ?? [])) {
    const text = label.textContent?.trim();
    if (text) {
      return text;
    }
  }

  if (element.id) {
    const explicitLabel = document.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(element.id)}"]`,
    );
    const text = explicitLabel?.textContent?.trim();
    if (text) {
      return text;
    }
  }

  return null;
};

const radioMatchesRequestedValue = (
  element: HTMLInputElement,
  requestedValue: string,
): boolean => {
  const normalizedRequestedValue = normalizeFillValue(requestedValue);
  const candidates = [
    element.value,
    element.id,
    getRadioOptionLabel(element),
  ].filter(
    (candidate): candidate is string =>
      candidate !== null && candidate.trim().length > 0,
  );

  return candidates.some(
    (candidate) => normalizeFillValue(candidate) === normalizedRequestedValue,
  );
};

export const getRadioGroupActualValue = (element: HTMLInputElement): string => {
  const checkedRadio = getRadioGroupElements(element).find(
    (radio) => radio.checked,
  );

  return checkedRadio?.value ?? "unchecked";
};

const setInputChecked = (element: HTMLInputElement, checked: boolean): void => {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "checked",
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(element, checked);
  } else {
    element.checked = checked;
  }
};

const fillRadioInput = (
  element: HTMLInputElement,
  value: string,
): DomFillResult => {
  const expectedChecked = getRequestedCheckedState(element, value);

  if (expectedChecked === false) {
    const actualValue = getRadioGroupActualValue(element);

    if (actualValue === "unchecked") {
      return buildDomFillResult(false, true, actualValue);
    }

    return buildDomFillResult(
      false,
      false,
      actualValue,
      "Radio groups cannot be unchecked safely",
    );
  }

  const target =
    getRadioGroupElements(element).find((radio) =>
      radioMatchesRequestedValue(radio, value),
    ) ?? (expectedChecked === true ? element : null);

  if (!target) {
    return buildDomFillResult(
      false,
      false,
      getRadioGroupActualValue(element),
      "Could not find matching radio option",
    );
  }

  target.focus({ preventScroll: true });
  setInputChecked(target, true);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));

  if (target.checked && radioMatchesRequestedValue(target, value)) {
    return buildDomFillResult(true, true, getRadioGroupActualValue(target));
  }

  return buildDomFillResult(
    true,
    false,
    getRadioGroupActualValue(target),
    "DOM radio value did not match requested option",
  );
};

export const fillCheckableInput = (
  element: HTMLInputElement,
  value: string,
): DomFillResult => {
  if (element.type === "radio") {
    return fillRadioInput(element, value);
  }

  const expectedChecked = getRequestedCheckedState(element, value);
  const actualValue = getCheckableActualValue(element);

  if (expectedChecked === null) {
    return buildDomFillResult(
      false,
      false,
      actualValue,
      "Could not infer requested checked state",
    );
  }

  element.focus({ preventScroll: true });
  setInputChecked(element, expectedChecked);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));

  if (element.checked === expectedChecked) {
    return buildDomFillResult(true, true, getCheckableActualValue(element));
  }

  return buildDomFillResult(
    true,
    false,
    getCheckableActualValue(element),
    "DOM checked state did not match requested state",
  );
};
