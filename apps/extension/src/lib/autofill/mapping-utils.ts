type MappingBase = {
  fieldOpid: string;
  value: string | null;
  confidence: number;
  reasoning: string;
  autoFill?: boolean;
};

type FieldWithOpid = { fieldOpid: string } | { opid: string };

const getFieldOpid = (field: FieldWithOpid): string => {
  if ("fieldOpid" in field) {
    return field.fieldOpid;
  }
  return field.opid;
};

export const createEmptyMapping = <
  TField extends FieldWithOpid,
  TMapping extends MappingBase,
>(
  field: TField,
  reason: string,
  overrides?: Omit<Partial<TMapping>, "fieldOpid">,
): TMapping => {
  const fieldOpid = getFieldOpid(field);

  const base: MappingBase = {
    fieldOpid,
    value: null,
    confidence: 0,
    reasoning: reason,
  };

  return {
    ...base,
    ...(overrides ?? {}),
    fieldOpid,
  } as TMapping;
};

export const roundConfidence = (value: number): number =>
  Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
