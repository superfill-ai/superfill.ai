import {
  extractRadioGroup,
  extractSelectOptions,
} from "@/lib/autofill/dom-serializer";
import type {
  DetectedField,
  FieldMetadata,
  FieldPurpose,
  FieldType,
  FormFieldElement,
  RadioGroupInfo,
  SelectOption,
} from "@/types/autofill";

/**
 * Simplified FieldAnalyzer
 *
 * Relies on DOM serialization for context, keeping only essential metadata extraction.
 * Removes complex positional label detection - the serialized DOM provides that context.
 */
export class FieldAnalyzer {
  analyzeField(field: DetectedField): FieldMetadata {
    const element = field.element;

    const basicAttrs = this.extractBasicAttributes(element);
    const labelTag = this.findExplicitLabel(element);
    const labelAria = this.findAriaLabel(element);
    const fieldType = this.classifyFieldType(element);

    // Extract choice-specific data
    const options = this.extractOptions(element, fieldType);
    const radioGroup = this.extractRadioGroupInfo(element, fieldType);
    const isChecked = this.getCheckedState(element, fieldType);

    const metadata: Omit<FieldMetadata, "fieldPurpose"> = {
      ...basicAttrs,
      labelTag,
      labelAria,
      helperText: this.findHelperText(element),
      fieldType,
      rect: element.getBoundingClientRect(),
      currentValue: this.getCurrentValue(element),
      options,
      radioGroup,
      isChecked,
    };

    return {
      ...metadata,
      fieldPurpose: this.inferFieldPurpose(metadata, fieldType),
    };
  }

  private extractBasicAttributes(element: FormFieldElement) {
    return {
      id: element.getAttribute("id") || null,
      name: element.getAttribute("name") || null,
      className: element.getAttribute("class") || null,
      type: element.getAttribute("type") || element.tagName.toLowerCase(),
      placeholder: element.getAttribute("placeholder") || null,
      autocomplete: element.getAttribute("autocomplete") || null,
      required: element.hasAttribute("required"),
      disabled: element.hasAttribute("disabled"),
      readonly: element.hasAttribute("readonly"),
      maxLength:
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
          ? element.maxLength > 0
            ? element.maxLength
            : null
          : null,
    };
  }

  private findExplicitLabel(element: FormFieldElement): string | null {
    // Check for label with "for" attribute
    if (element.id) {
      const label = document.querySelector<HTMLLabelElement>(
        `label[for="${element.id}"]`,
      );
      if (label) {
        return this.cleanText(label.textContent || "");
      }
    }

    // Check for wrapping label
    const parentLabel = element.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as HTMLLabelElement;
      const inputs = clone.querySelectorAll("input, select, textarea");
      for (const input of Array.from(inputs)) {
        input.remove();
      }
      return this.cleanText(clone.textContent || "");
    }

    return null;
  }

  private findAriaLabel(element: FormFieldElement): string | null {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      return this.cleanText(ariaLabel);
    }

    const ariaLabelledBy = element.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const labelElement = document.getElementById(ariaLabelledBy);
      if (labelElement) {
        return this.cleanText(labelElement.textContent || "");
      }
    }

    return null;
  }

  private findHelperText(element: FormFieldElement): string | null {
    const describedBy = element.getAttribute("aria-describedby");
    if (describedBy) {
      const helperElement = document.getElementById(describedBy);
      if (helperElement) {
        return this.cleanText(helperElement.textContent || "");
      }
    }

    const parent = element.parentElement;
    if (parent) {
      const helper = parent.querySelector(
        '[class*="help"], [class*="hint"], [class*="description"]',
      );
      if (helper && helper !== element) {
        return this.cleanText(helper.textContent || "");
      }
    }

    return null;
  }

  private extractOptions(
    element: FormFieldElement,
    fieldType: FieldType,
  ): SelectOption[] | undefined {
    if (fieldType !== "select") {
      return undefined;
    }

    if (element instanceof HTMLSelectElement) {
      return extractSelectOptions(element);
    }

    return undefined;
  }

  private extractRadioGroupInfo(
    element: FormFieldElement,
    fieldType: FieldType,
  ): RadioGroupInfo | undefined {
    if (fieldType !== "radio") {
      return undefined;
    }

    if (element instanceof HTMLInputElement) {
      return extractRadioGroup(element) || undefined;
    }

    return undefined;
  }

  private getCheckedState(
    element: FormFieldElement,
    fieldType: FieldType,
  ): boolean | undefined {
    if (fieldType !== "checkbox" && fieldType !== "radio") {
      return undefined;
    }

    if (element instanceof HTMLInputElement) {
      return element.checked;
    }

    return undefined;
  }

  private getCurrentValue(element: FormFieldElement): string {
    if (element instanceof HTMLSelectElement) {
      return element.value || "";
    }
    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" || element.type === "radio") {
        return element.checked ? element.value || "on" : "";
      }
      return element.value || "";
    }
    if (element instanceof HTMLTextAreaElement) {
      return element.value || "";
    }
    return "";
  }

  private classifyFieldType(element: FormFieldElement): FieldType {
    if (element instanceof HTMLTextAreaElement) {
      return "textarea";
    }

    if (element instanceof HTMLSelectElement) {
      return "select";
    }

    if (element instanceof HTMLInputElement) {
      const type = element.type.toLowerCase();

      const typeMap: Record<string, FieldType> = {
        email: "email",
        tel: "tel",
        url: "url",
        password: "password",
        number: "number",
        date: "date",
        checkbox: "checkbox",
        radio: "radio",
      };

      return typeMap[type] || "text";
    }

    return "text";
  }

  private inferFieldPurpose(
    metadata: Omit<FieldMetadata, "fieldPurpose">,
    fieldType: FieldType,
  ): FieldPurpose {
    if (fieldType === "email") return "email";
    if (fieldType === "tel") return "phone";

    const autocomplete = metadata.autocomplete?.toLowerCase();
    if (autocomplete) {
      const autocompleteMap: Record<string, FieldPurpose> = {
        name: "name",
        "given-name": "name",
        "family-name": "name",
        email: "email",
        tel: "phone",
        "street-address": "address",
        "address-line1": "address",
        "address-line2": "address",
        city: "city",
        state: "state",
        "postal-code": "zip",
        country: "country",
        organization: "company",
        "job-title": "title",
      };

      const purpose = autocompleteMap[autocomplete];
      if (purpose) return purpose;
    }

    // Use available label sources for pattern matching
    const allText = [
      metadata.labelTag,
      metadata.labelAria,
      metadata.placeholder,
      metadata.name,
      metadata.id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const patterns: Array<{ regex: RegExp; purpose: FieldPurpose }> = [
      { regex: /\b(email|e-mail|mail)\b/i, purpose: "email" },
      { regex: /\b(phone|tel|telephone|mobile|cell)\b/i, purpose: "phone" },
      {
        regex:
          /\b(name|full[\s-]?name|first[\s-]?name|last[\s-]?name|given[\s-]?name|family[\s-]?name)\b/i,
        purpose: "name",
      },
      {
        regex: /\b(address|street|addr|location|residence)\b/i,
        purpose: "address",
      },
      { regex: /\b(city|town)\b/i, purpose: "city" },
      { regex: /\b(state|province|region)\b/i, purpose: "state" },
      { regex: /\b(zip|postal[\s-]?code|postcode)\b/i, purpose: "zip" },
      { regex: /\b(country|nation)\b/i, purpose: "country" },
      {
        regex: /\b(company|organization|employer|business)\b/i,
        purpose: "company",
      },
      { regex: /\b(title|position|job[\s-]?title|role)\b/i, purpose: "title" },
    ];

    for (const { regex, purpose } of patterns) {
      if (regex.test(allText)) {
        return purpose;
      }
    }

    return "unknown";
  }

  private cleanText(text: string): string | null {
    const cleaned = text
      .replace(/[\n\r\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned.length > 0 && cleaned.length < 200 ? cleaned : null;
  }
}
