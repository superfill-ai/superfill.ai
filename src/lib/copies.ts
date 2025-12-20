import type { TrackableFieldType } from "@/types/autofill";
import type { AllowedCategory } from "@/types/memory";

export const allowedCategories = [
  "contact",
  "general",
  "location",
  "work",
  "personal",
  "education",
] as const;

export function isAllowedCategory(value: string): value is AllowedCategory {
  return allowedCategories.includes(value as AllowedCategory);
}

export const TRACKABLE_FIELD_TYPES = [
  "text",
  "email",
  "tel",
  "textarea",
  "url",
] as const;

export function isTrackableFieldType(
  value: string,
): value is TrackableFieldType {
  return TRACKABLE_FIELD_TYPES.includes(value as TrackableFieldType);
}
