type MappingBase = {
  selector: string;
  /** @deprecated Use selector instead */
  fieldOpid?: string;
  value: string | null;
  confidence: number;
  reasoning: string;
  autoFill?: boolean;
};

export const createEmptyMapping = <
  TField extends { selector: string },
  TMapping extends MappingBase,
>(
  field: TField,
  reason: string,
  overrides?: Omit<Partial<TMapping>, "selector">,
): TMapping => {
  const base: MappingBase = {
    selector: field.selector,
    value: null,
    confidence: 0,
    reasoning: reason,
  };

  return {
    ...base,
    ...(overrides ?? {}),
    selector: field.selector,
  } as TMapping;
};

export const roundConfidence = (value: number): number =>
  Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
