import type { FieldPurpose } from "@/types/autofill";

export const FIELD_PURPOSE_KEYWORDS: Record<
  Exclude<FieldPurpose, "unknown">,
  readonly string[]
> = {
  name: ["name", "fullname", "first", "last", "given", "family"],
  "name.first": ["first", "given", "forename"],
  "name.middle": ["middle", "additional"],
  "name.last": ["last", "family", "surname"],
  email: ["email", "mail", "e-mail", "inbox"],
  phone: ["phone", "tel", "mobile", "cell", "telephone"],
  address: ["address", "street", "addr", "location"],
  "address.full": ["address", "street", "location", "residence"],
  "address.line1": ["address", "street", "line1", "line 1"],
  "address.line2": ["address", "apartment", "suite", "unit", "line2", "line 2"],
  "address.line3": ["address", "line3", "line 3"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  zip: ["zip", "postal", "postcode"],
  country: ["country", "nation"],
  company: ["company", "organization", "employer", "business"],
  title: ["title", "position", "role", "job"],
} as const;

export const MAX_FIELDS_PER_PAGE = 200;

export const MAX_MEMORIES_FOR_MATCHING = 50;

export const CONFIDENCE_LEVELS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.0,
} as const;

export const MIN_MATCH_CONFIDENCE = 0.35;

export const STOP_WORDS = new Set<string>([
  "the",
  "and",
  "for",
  "with",
  "your",
  "please",
  "enter",
  "type",
  "here",
  "click",
  "select",
  "choose",
  "submit",
  "field",
  "form",
  "info",
  "information",
  "optional",
  "required",
]);

/**
 * Minimum quality score threshold for form field detection
 * Range: 0 (unusable) to 1 (high quality)
 */
export const MIN_FIELD_QUALITY = 0.3;
