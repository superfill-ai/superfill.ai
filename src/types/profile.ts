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
