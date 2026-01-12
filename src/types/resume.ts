import type { AllowedCategory } from "./memory";

export interface ResumeExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  isCurrent?: boolean;
}

export interface ResumeEducation {
  school: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  activities?: string;
}

export interface ResumeProject {
  name: string;
  description?: string;
  url?: string;
  technologies?: string[];
  startDate?: string;
  endDate?: string;
}

export interface ResumeCertification {
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}

export interface ResumeLanguage {
  language: string;
  proficiency?: string;
}

export interface ResumeSkill {
  name: string;
  level?: string;
  category?: string;
}

export interface ResumeData {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  summary?: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  projects?: ResumeProject[];
  achievements?: string[];
  certifications?: ResumeCertification[];
  languages?: ResumeLanguage[];
}

export interface ResumeImportItem {
  id: string;
  label: string;
  question: string;
  answer: string;
  category: AllowedCategory;
  tags: string[];
  selected: boolean;
  source:
    | "name"
    | "contact"
    | "summary"
    | "experience"
    | "education"
    | "skills"
    | "projects"
    | "achievements"
    | "certifications"
    | "other";
}

export type ResumeParserStatus =
  | "idle"
  | "reading"
  | "parsing"
  | "success"
  | "error";

export interface ResumeParserResult {
  success: boolean;
  data?: ResumeData;
  rawText?: string;
  error?: string;
}
