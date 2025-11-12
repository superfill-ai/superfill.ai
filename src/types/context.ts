export type WebsiteType =
  | "job_portal"
  | "social"
  | "e-commerce"
  | "blog"
  | "forum"
  | "news"
  | "corporate"
  | "portfolio"
  | "dating"
  | "rental"
  | "survey"
  | "unknown";

export interface PageMetadata {
  title: string;
  description: string | null;
  keywords: string[] | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogSiteName: string | null;
  ogType: string | null;
  url: string;
}

export interface WebsiteContext {
  metadata: PageMetadata;
  websiteType: WebsiteType;
  formPurpose: string;
}
