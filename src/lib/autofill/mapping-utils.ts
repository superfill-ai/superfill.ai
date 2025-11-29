type MappingBase = {
  fieldOpid: string;
  value: string | null;
  confidence: number;
  reasoning: string;
  autoFill?: boolean;
};

export const createEmptyMapping = <
  TField extends { opid: string },
  TMapping extends MappingBase,
>(
  field: TField,
  reason: string,
  overrides?: Omit<Partial<TMapping>, "fieldOpid">,
): TMapping => {
  const base: MappingBase = {
    fieldOpid: field.opid,
    value: null,
    confidence: 0,
    reasoning: reason,
  };

  return {
    ...base,
    ...(overrides ?? {}),
    fieldOpid: field.opid,
  } as TMapping;
};

export const roundConfidence = (value: number): number =>
  Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
