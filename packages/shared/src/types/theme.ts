export const Theme = {
  DEFAULT: "system",
  DARK: "dark",
  LIGHT: "light",
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];
