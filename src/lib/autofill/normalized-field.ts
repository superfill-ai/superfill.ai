import type {
  CDPDetectedField,
  CDPFieldRole,
  CompressedFieldData,
  DetectedFieldSnapshot,
  FieldType,
  NormalizedField,
  SelectOptionSnapshot,
} from "@/types/autofill";
import { getAutocompleteTokens, inferFieldPurpose } from "./field-purpose";
import { isCrypticString } from "./field-quality";

const MAX_LABEL_LENGTH = 100;

const ROLE_TO_FIELD_TYPE: Record<CDPFieldRole, FieldType> = {
  textbox: "text",
  searchbox: "text",
  textarea: "textarea",
  combobox: "select",
  listbox: "select",
  checkbox: "checkbox",
  switch: "checkbox",
  menuitemcheckbox: "checkbox",
  radio: "radio",
  menuitemradio: "radio",
  radiogroup: "radio",
  spinbutton: "number",
  slider: "number",
};

const INPUT_TYPE_TO_FIELD_TYPE: Partial<Record<string, FieldType>> = {
  email: "email",
  tel: "tel",
  url: "url",
  number: "number",
  date: "date",
  password: "password",
};

function deduplicateLabels(labels: string[]): string[] {
  const truncated = labels.map((label) =>
    label.length > MAX_LABEL_LENGTH
      ? `${label.slice(0, MAX_LABEL_LENGTH)}...`
      : label,
  );
  const result: string[] = [];
  for (const label of truncated) {
    const lowerLabel = label.toLowerCase();
    const isSubstring = result.some((existing) =>
      existing.toLowerCase().includes(lowerLabel),
    );
    if (!isSubstring) {
      result.push(label);
    }
  }
  return result;
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => {
    return value !== null && value !== undefined && value.trim().length > 0;
  });
}

function buildContext(parts: Array<string | null | undefined>): string {
  return compactStrings(parts).join(" ").slice(0, 300);
}

function includeOptions(
  type: FieldType,
  options: SelectOptionSnapshot[] | undefined,
): SelectOptionSnapshot[] | undefined {
  if (type !== "select" && type !== "radio" && type !== "checkbox") {
    return undefined;
  }

  return options && options.length > 0 ? options : undefined;
}

export function normalizeDOMField(
  field: DetectedFieldSnapshot,
): NormalizedField {
  const labels = deduplicateLabels(
    compactStrings([
      field.metadata.labelTag,
      field.metadata.labelAria,
      field.metadata.labelData,
      field.metadata.labelLeft,
      field.metadata.labelTop,
    ]),
  );

  const contextParts = [field.metadata.placeholder, field.metadata.helperText];
  if (field.metadata.name && !isCrypticString(field.metadata.name)) {
    contextParts.push(field.metadata.name);
  }
  if (field.metadata.id && !isCrypticString(field.metadata.id)) {
    contextParts.push(field.metadata.id);
  }

  return {
    opid: field.opid,
    highlightIndex: field.highlightIndex,
    source: "dom",
    type: field.metadata.fieldType,
    purpose: field.metadata.fieldPurpose,
    labels,
    context: buildContext(contextParts),
    autocomplete: field.metadata.autocomplete,
    autocompleteTokens: getAutocompleteTokens(field.metadata.autocomplete),
    currentValue: field.metadata.currentValue,
    required: field.metadata.required,
    ...(includeOptions(field.metadata.fieldType, field.metadata.options)
      ? { options: field.metadata.options }
      : {}),
  };
}

export function normalizeCDPField(field: CDPDetectedField): NormalizedField {
  const dm = field.domMetadata;
  const inputType = dm?.inputType ?? null;
  const type =
    inputType && INPUT_TYPE_TO_FIELD_TYPE[inputType]
      ? INPUT_TYPE_TO_FIELD_TYPE[inputType]
      : ROLE_TO_FIELD_TYPE[field.role];

  const labels = deduplicateLabels(
    Array.from(
      new Set(
        compactStrings([
          field.name,
          dm?.labelText,
          field.description,
          dm?.ariaDescribedByText,
        ]),
      ),
    ),
  );

  const contextParts = [dm?.placeholder, dm?.helperText];
  if (
    field.description &&
    !labels.some((label) => label.includes(field.description))
  ) {
    contextParts.push(field.description);
  }
  if (dm?.htmlName && !isCrypticString(dm.htmlName)) {
    contextParts.push(dm.htmlName);
  }
  if (dm?.htmlId && !isCrypticString(dm.htmlId)) {
    contextParts.push(dm.htmlId);
  }

  const autocomplete = dm?.autocomplete ?? null;
  const purpose = inferFieldPurpose({
    fieldType: type,
    autocomplete,
    labels: [field.name, dm?.labelText, field.description],
    placeholder: dm?.placeholder ?? null,
    htmlName: dm?.htmlName ?? null,
    htmlId: dm?.htmlId ?? null,
  });

  return {
    opid: field.opid,
    highlightIndex: field.highlightIndex,
    source: "cdp",
    type,
    purpose,
    labels,
    context: buildContext(contextParts),
    autocomplete,
    autocompleteTokens: getAutocompleteTokens(autocomplete),
    currentValue:
      field.checked === undefined ? field.value : String(field.checked),
    required: field.required,
    ...(includeOptions(type, field.options) ? { options: field.options } : {}),
  };
}

export function compressNormalizedField(
  field: NormalizedField,
): CompressedFieldData {
  return {
    opid: field.opid,
    highlightIndex: field.highlightIndex,
    type: field.type,
    purpose: field.purpose,
    labels: field.labels,
    context: field.context,
    ...(field.autocompleteTokens.length > 0
      ? { autocompleteTokens: field.autocompleteTokens }
      : {}),
    ...(field.options ? { options: field.options } : {}),
  };
}
