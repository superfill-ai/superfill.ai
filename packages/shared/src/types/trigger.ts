export const Trigger = {
  POPUP: "popup",
  CONTENT: "content",
  OPTIONS: "options",
} as const;

export type Trigger = (typeof Trigger)[keyof typeof Trigger];
