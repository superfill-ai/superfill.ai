type MappingBase = {
  /** Field operation ID - unique runtime identifier (primary key) */
  fieldOpid: string;
  value: string | null;
  confidence: number;
  reasoning: string;
  autoFill?: boolean;
};

/** Field type that has either fieldOpid or opid property */
type FieldWithOpid = { selector: string } & (
  | { fieldOpid: string }
  | { opid: string }
);

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
  overrides?: Omit<Partial<TMapping>, "fieldOpid" | "selector">,
): TMapping => {
  const fieldOpid = getFieldOpid(field);

  const base: MappingBase = {
    fieldOpid: field.opid,
    value: null,
    confidence: 0,
    reasoning: reason,
  };

  return {
    ...base,
    ...(overrides ?? {}),
    fieldOpid,
    selector: field.selector,
  } as TMapping;
};

export const roundConfidence = (value: number): number =>
  Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
