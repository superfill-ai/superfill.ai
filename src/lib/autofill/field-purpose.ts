import type { FieldPurpose, FieldType } from "@/types/autofill";

const AUTOCOMPLETE_TO_PURPOSE: Record<string, FieldPurpose> = {
  name: "name",
  "given-name": "name.first",
  "family-name": "name.last",
  "additional-name": "name.middle",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "tel-local": "phone",
  "street-address": "address.full",
  "address-line1": "address.line1",
  "address-line2": "address.line2",
  "address-line3": "address.line3",
  "address-level2": "city",
  city: "city",
  "address-level1": "state",
  state: "state",
  "postal-code": "zip",
  "country-name": "country",
  country: "country",
  organization: "company",
  "organization-title": "title",
  "job-title": "title",
};

const PURPOSE_PATTERNS: Array<{ regex: RegExp; purpose: FieldPurpose }> = [
  { regex: /\b(email|e-mail|mail)\b/i, purpose: "email" },
  { regex: /\b(phone|tel|telephone|mobile|cell)\b/i, purpose: "phone" },
  {
    regex: /\b(first|given|forename)[\s_-]*name\b|\bgiven[\s_-]*name\b/i,
    purpose: "name.first",
  },
  {
    regex: /\b(middle|additional)[\s_-]*name\b/i,
    purpose: "name.middle",
  },
  {
    regex: /\b(last|family|sur)[\s_-]*name\b|\bsurname\b/i,
    purpose: "name.last",
  },
  {
    regex:
      /\b(name|full[\s-]?name|first[\s-]?name|last[\s-]?name|given[\s-]?name|family[\s-]?name|middle[\s-]?name)\b/i,
    purpose: "name",
  },
  {
    regex:
      /\b(address[\s_-]*line[\s_-]*2|street[\s_-]*2|apartment|apt|suite|unit)\b/i,
    purpose: "address.line2",
  },
  {
    regex: /\b(address[\s_-]*line[\s_-]*1|street[\s_-]*1|street)\b/i,
    purpose: "address.line1",
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

export function getAutocompleteTokens(autocomplete: string | null): string[] {
  if (!autocomplete) {
    return [];
  }

  return autocomplete
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export function inferFieldPurpose(input: PurposeInferenceInput): FieldPurpose {
  if (input.fieldType === "email") return "email";
  if (input.fieldType === "tel") return "phone";

  for (const token of getAutocompleteTokens(input.autocomplete)) {
    const purpose = AUTOCOMPLETE_TO_PURPOSE[token.toLowerCase()];
    if (purpose) {
      return purpose;
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
