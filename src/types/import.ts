import type { AllowedCategory, MemoryEntry } from "./memory";

export interface BaseImportItem {
  id: string;
  label: string;
  question: string;
  answer: string;
  category: AllowedCategory;
  tags: string[];
  selected: boolean;
  /** Populated only for document imports when an existing memory matches this item */
  existingDuplicate?: MemoryEntry;
}

export type BaseImportStatus =
  | "idle"
  | "loading"
  | "parsing"
  | "success"
  | "error";
