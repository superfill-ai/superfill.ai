import type { FieldType, FormFieldElement } from "@/types/autofill";

export function fillField(
  element: FormFieldElement,
  value: string,
  _fieldType: FieldType,
): boolean {
  if (!element || !value) return false;

  try {
    if (element instanceof HTMLSelectElement) {
      return fillSelectField(element, value);
    }

    if (element instanceof HTMLInputElement) {
      const inputType = element.type.toLowerCase();

      if (inputType === "checkbox") {
        return fillCheckboxField(element, value);
      }

      if (inputType === "radio") {
        return fillRadioField(element, value);
      }

      // Text, email, tel, url, number, date, etc.
      return fillTextInputField(element, value);
    }

    if (element instanceof HTMLTextAreaElement) {
      return fillTextInputField(element, value);
    }

    return false;
  } catch (error) {
    console.error("Error filling field:", error);
    return false;
  }
}

function fillSelectField(element: HTMLSelectElement, value: string): boolean {
  const normalizedSearch = normalizeForComparison(value);

  // Exact match only on value or text (case and punctuation insensitive)
  const option = Array.from(element.options).find(
    (opt) =>
      normalizeForComparison(opt.value) === normalizedSearch ||
      normalizeForComparison(opt.text) === normalizedSearch,
  );

  if (option) {
    element.value = option.value;
    dispatchEvents(element);
    return true;
  }

  return false;
}

function fillCheckboxField(element: HTMLInputElement, value: string): boolean {
  const shouldCheck = ["true", "1", "yes", "on", "checked"].includes(
    value.toLowerCase(),
  );

  if (element.checked !== shouldCheck) {
    element.checked = shouldCheck;
    dispatchEvents(element);
  }
  return true;
}

function fillRadioField(element: HTMLInputElement, value: string): boolean {
  const name = element.name;
  if (!name) return false;

  const radios = document.querySelectorAll<HTMLInputElement>(
    `input[type="radio"][name="${CSS.escape(name)}"]`,
  );

  const normalizedSearch = normalizeForComparison(value);

  for (const radio of radios) {
    const labelText = radio.labels?.[0]?.textContent?.trim() ?? "";
    const radioValue = radio.value;

    if (
      normalizeForComparison(radioValue) === normalizedSearch ||
      normalizeForComparison(labelText) === normalizedSearch
    ) {
      radio.checked = true;
      dispatchEvents(radio);
      return true;
    }
  }

  return false;
}

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fillTextInputField(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  element.value = value;
  dispatchEvents(element);
  return true;
}

function dispatchEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}
