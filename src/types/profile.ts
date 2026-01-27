import type { AllowedCategory } from "./memory";

export interface ProfileImportItem {
  id: string;
  label: string;
  question: string;
  answer: string;
  category: AllowedCategory;
  tags: string[];
  selected: boolean;
}

export type ProfileScraperStatus =
  | "idle"
  | "opening-tab"
  | "scraping"
  | "parsing"
  | "success"
  | "error";

export interface ProfileContentResult {
  success: boolean;
  rawContent?: string;
  pageUrl?: string;
  pageTitle?: string;
  error?: string;
}

export interface ProfileScraperResult {
  success: boolean;
  items?: ProfileImportItem[];
  error?: string;
}
