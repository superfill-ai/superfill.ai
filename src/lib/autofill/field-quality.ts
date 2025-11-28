import type { FieldMetadata } from "@/types/autofill";

const CRYPTIC_PATTERNS = [
  /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i,
  /\[[\w-]{8,}\]\[field\d+\]/i,
  /field_\d{8,}/i,
  /\b[a-zA-Z0-9]{20,}\b/,
  /^[A-Za-z0-9+/]{20,}={0,2}$/,
  /^(question|input|field|control)_[a-f0-9]{8,}$/i,
];

export function isCrypticString(str: string | null): boolean {
  if (!str || str.length < 8) return false;

  if (str.length < 12 && /^[a-z_-]+$/i.test(str)) {
    return false;
  }

  return CRYPTIC_PATTERNS.some((pattern) => pattern.test(str));
}

export function hasAnyLabel(metadata: FieldMetadata): boolean {
  return (
    !!metadata.labelTag ||
    !!metadata.labelAria ||
    !!metadata.labelTop ||
    !!metadata.labelLeft ||
    !!metadata.labelRight ||
    !!metadata.placeholder
  );
}

export function hasValidContext(metadata: FieldMetadata): boolean {
  return (
    !!metadata.placeholder ||
    !!metadata.helperText ||
    (!!metadata.name && !isCrypticString(metadata.name)) ||
    (!!metadata.id && !isCrypticString(metadata.id))
  );
}

export function scoreField(metadata: FieldMetadata): number {
  let score = 0;

  const hasLabels =
    !!metadata.labelTag ||
    !!metadata.labelAria ||
    !!metadata.labelTop ||
    !!metadata.labelLeft ||
    !!metadata.labelRight;

  const hasKnownPurpose = metadata.fieldPurpose !== "unknown";
  const hasContext = hasValidContext(metadata);

  if (hasLabels) score += 0.5;
  if (hasKnownPurpose) score += 0.3;
  if (hasContext) score += 0.2;

  const hasCrypticName = isCrypticString(metadata.name);
  const hasCrypticId = isCrypticString(metadata.id);

  if (hasCrypticName && hasCrypticId && !hasLabels) {
    score = 0;
  }

  return Math.min(score, 1.0);
}

export interface FilterStats {
  total: number;
  filtered: number;
  reasons: {
    noQuality: number;
    duplicate: number;
    unknownUnlabeled: number;
  };
}

export function createFilterStats(): FilterStats {
  return {
    total: 0,
    filtered: 0,
    reasons: {
      noQuality: 0,
      duplicate: 0,
      unknownUnlabeled: 0,
    },
  };
}
