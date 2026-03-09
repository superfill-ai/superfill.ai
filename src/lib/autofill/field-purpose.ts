import type { FieldPurpose, FieldType } from "@/types/autofill";

const AUTOCOMPLETE_TO_PURPOSE: Record<string, FieldPurpose> = {
  name: "name",
  "given-name": "name",
  "family-name": "name",
  "additional-name": "name",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "tel-local": "phone",
  "street-address": "address",
  "address-line1": "address",
  "address-line2": "address",
  "address-level2": "city",
  city: "city",
  "address-level1": "state",
  state: "state",
  "postal-code": "zip",
  "country-name": "country",
  country: "country",
  organization: "company",
  "job-title": "title",
};

const PURPOSE_PATTERNS: Array<{ regex: RegExp; purpose: FieldPurpose }> = [
  { regex: /\b(email|e-mail|mail)\b/i, purpose: "email" },
  { regex: /\b(phone|tel|telephone|mobile|cell)\b/i, purpose: "phone" },
  {
    regex:
      /\b(name|full[\s-]?name|first[\s-]?name|last[\s-]?name|given[\s-]?name|family[\s-]?name|middle[\s-]?name)\b/i,
    purpose: "name",
  },
  {
    regex: /\b(address|street|addr|location|residence)\b/i,
    purpose: "address",
  },
  { regex: /\b(city|town|municipality)\b/i, purpose: "city" },
  { regex: /\b(state|province|region)\b/i, purpose: "state" },
  {
    regex: /\b(zip|postal[\s-]?code|postcode|pin[\s-]?code)\b/i,
    purpose: "zip",
  },
  { regex: /\b(country|nation)\b/i, purpose: "country" },
  {
    regex: /\b(company|organization|employer|business|org)\b/i,
    purpose: "company",
  },
  {
    regex: /\b(title|position|job[\s-]?title|role|designation)\b/i,
    purpose: "title",
  },
];

export interface PurposeInferenceInput {
  fieldType: FieldType;
  autocomplete: string | null;
  labels: (string | null | undefined)[];
  placeholder: string | null;
  htmlName: string | null;
  htmlId: string | null;
}

export function inferFieldPurpose(input: PurposeInferenceInput): FieldPurpose {
  if (input.fieldType === "email") return "email";
  if (input.fieldType === "tel") return "phone";

  const autocomplete = input.autocomplete?.toLowerCase();
  if (autocomplete) {
    const tokens = autocomplete.split(/\s+/);
    for (const token of tokens) {
      const purpose = AUTOCOMPLETE_TO_PURPOSE[token];
      if (purpose) return purpose;
    }
  }

  const allText = [
    ...input.labels,
    input.placeholder,
    input.htmlName,
    input.htmlId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const { regex, purpose } of PURPOSE_PATTERNS) {
    if (regex.test(allText)) {
      return purpose;
    }
  }

  return "unknown";
}
