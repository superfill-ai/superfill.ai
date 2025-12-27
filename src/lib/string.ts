export const normalizeString = (str: string): string => {
  return str.toLowerCase().trim().replace(/\s+/g, " ");
};
