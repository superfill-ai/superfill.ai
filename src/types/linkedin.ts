import type { AllowedCategory } from "./memory";

export interface LinkedInExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  isCurrent?: boolean;
}

export interface LinkedInEducation {
  school: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface LinkedInProfileData {
  name?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  location?: string;
  about?: string;
  profileUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: string[];
}

export interface LinkedInImportItem {
  id: string;
  label: string;
  question: string;
  answer: string;
  category: AllowedCategory;
  tags: string[];
  selected: boolean;
  source:
    | "name"
    | "headline"
    | "location"
    | "about"
    | "experience"
    | "education"
    | "skills"
    | "contact";
}

export type LinkedInScraperStatus =
  | "idle"
  | "opening-tab"
  | "waiting-for-login"
  | "scraping"
  | "success"
  | "error";

export interface LinkedInScraperResult {
  success: boolean;
  data?: LinkedInProfileData;
  error?: string;
  requiresLogin?: boolean;
}
