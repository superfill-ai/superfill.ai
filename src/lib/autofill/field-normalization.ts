import type {
  CDPDetectedField,
  DetectedFieldSnapshot,
  FieldMapping,
  FieldOpId,
} from "@/types/autofill";

const FIELD_OPID_PATTERN = /^(__\d+|__frame_.+__field_\d+|cdp-.+)$/;

export type NormalizedFillField = {
  readonly fieldOpid: FieldOpId;
  readonly value: string;
  readonly confidence: number;
  readonly frameId?: number | string;
  readonly cdpField?: CDPDetectedField;
};

export type NormalizeFieldInput = {
  readonly mappings: readonly FieldMapping[];
  readonly confidenceThreshold: number;
  readonly cdpFields?: readonly CDPDetectedField[];
  readonly detectedFields?: readonly DetectedFieldSnapshot[];
};

export function isFieldOpId(value: string): value is FieldOpId {
  return FIELD_OPID_PATTERN.test(value);
}

export function normalizeFieldsToFill({
  mappings,
  confidenceThreshold,
  cdpFields = [],
  detectedFields = [],
}: NormalizeFieldInput): NormalizedFillField[] {
  const cdpFieldLookup = new Map(cdpFields.map((field) => [field.opid, field]));
  const detectedFieldLookup = new Map(
    detectedFields.map((field) => [field.opid, field]),
  );
  const fields: NormalizedFillField[] = [];

  for (const mapping of mappings) {
    if (
      mapping.value === null ||
      mapping.confidence < confidenceThreshold ||
      mapping.autoFill === false ||
      !isFieldOpId(mapping.fieldOpid)
    ) {
      continue;
    }

    const cdpField = cdpFieldLookup.get(mapping.fieldOpid);
    const detectedField = detectedFieldLookup.get(
      mapping.fieldOpid as FieldOpId,
    );
    const normalized = {
      ...(detectedField?.frameId !== undefined
        ? { frameId: detectedField.frameId }
        : {}),
      fieldOpid: mapping.fieldOpid,
      value: mapping.value,
      confidence: mapping.confidence,
    };

    fields.push(cdpField ? { ...normalized, cdpField } : normalized);
  }

  return fields;
}
