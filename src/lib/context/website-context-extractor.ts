import type { PageMetadata, WebsiteContext } from "@/types/context";
import { WebsiteClassifier } from "./website-classifier";

export class WebsiteContextExtractor {
  private classifier: WebsiteClassifier;

  constructor() {
    this.classifier = new WebsiteClassifier();
  }

  private getMetaContent(name: string): string | null {
    const element =
      document.querySelector(`meta[name="${name}"]`) ||
      document.querySelector(`meta[property="${name}"]`);
    return element ? element.getAttribute("content") : null;
  }

  extract(): WebsiteContext {
    const metadata: PageMetadata = {
      title: document.title,
      description: this.getMetaContent("description"),
      keywords:
        this.getMetaContent("keywords")
          ?.split(",")
          .map((k) => k.trim()) ?? null,
      ogTitle: this.getMetaContent("og:title"),
      ogDescription: this.getMetaContent("og:description"),
      ogSiteName: this.getMetaContent("og:site_name"),
      ogType: this.getMetaContent("og:type"),
      url: window.location.href,
    };

    const websiteType = this.classifier.classify(metadata);

    // Basic form purpose inference (can be improved later)
    let formPurpose = "unknown";
    if (websiteType === "job_portal") formPurpose = "job_application";
    if (websiteType === "dating") formPurpose = "profile_creation";
    if (websiteType === "rental") formPurpose = "rental_application";
    if (websiteType === "survey") formPurpose = "survey_completion";

    const context: WebsiteContext = {
      metadata,
      websiteType,
      formPurpose,
    };

    return context;
  }
}
