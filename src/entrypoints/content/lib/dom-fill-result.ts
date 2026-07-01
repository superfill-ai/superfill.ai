export type DomFillResult = {
  readonly attempted: boolean;
  readonly verified: boolean;
  readonly actualValue: string;
  readonly reason?: string;
};

export const buildDomFillResult = (
  attempted: boolean,
  verified: boolean,
  actualValue: string,
  reason?: string,
): DomFillResult => {
  if (reason) {
    return { attempted, verified, actualValue, reason };
  }

  return { attempted, verified, actualValue };
};
