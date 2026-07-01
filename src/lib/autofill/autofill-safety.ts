import type { DetectedFieldSnapshot } from "@/types/autofill";

const CONSENT_LIKE_PATTERN =
  /\b(accept|accepted|agree|agreement|allow|alerts?|authorize|acknowledge|certify|communications?|consent|emails?|keep me informed|legal|marketing|messages?|newsletter|offers?|opt[\s-]?in|partners?|privacy|promotional|receive|send me|sign me up|sms|subscribe|terms|updates?)\b/i;

export function isConsentLikeChoiceField(
  field: DetectedFieldSnapshot,
): boolean {
  if (
    field.metadata.fieldType !== "checkbox" &&
    field.metadata.fieldType !== "radio"
  ) {
    return false;
  }

  const fieldText = [
    field.metadata.labelTag,
    field.metadata.labelAria,
    field.metadata.labelData,
    field.metadata.labelLeft,
    field.metadata.labelTop,
    field.metadata.placeholder,
    field.metadata.helperText,
    field.metadata.name,
    field.metadata.id,
  ]
    .filter((value): value is string => value !== null && value.length > 0)
    .join(" ");

  return CONSENT_LIKE_PATTERN.test(fieldText);
}
