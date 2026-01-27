import type { AllowedCategory } from "./memory";

export interface BaseImportItem {
  id: string;
  label: string;
  question: string;
  answer: string;
  category: AllowedCategory;
  tags: string[];
  selected: boolean;
}

export type BaseImportStatus =
  | "idle"
  | "loading"
  | "parsing"
  | "success"
  | "error";
