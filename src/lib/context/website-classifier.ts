import type { PageMetadata, WebsiteType } from "@/types/context";

const CLASSIFICATION_RULES: { type: WebsiteType; keywords: string[] }[] = [
  {
    type: "job_portal",
    keywords: [
      "jobs",
      "careers",
      "hiring",
      "employment",
      "recruiting",
      "workday",
      "greenhouse.io",
      "lever.co",
      "linkedin.com/jobs",
      "opportunities",
      "professional",
      "workday",
    ],
  },
  {
    type: "social",
    keywords: ["social network", "community", "friends", "facebook", "twitter"],
  },
  {
    type: "rental",
    keywords: [
      "rent",
      "apartment",
      "lease",
      "property",
      "zillow",
      "apartments.com",
    ],
  },
  {
    type: "survey",
    keywords: ["survey", "feedback", "questionnaire", "google.com/forms"],
  },
  {
    type: "forum",
    keywords: ["forum", "discussion", "board", "community", "stack overflow"],
  },
  {
    type: "blog",
    keywords: ["blog", "post", "article", "wordpress", "medium.com"],
  },
  {
    type: "dating",
    keywords: ["dating", "match", "singles", "okcupid", "tinder", "hinge"],
  },
];

export class WebsiteClassifier {
  classify(metadata: PageMetadata): WebsiteType {
    const textToSearch = [
      metadata.title,
      metadata.description,
      metadata.keywords?.join(" "),
      metadata.ogTitle,
      metadata.ogDescription,
      metadata.ogSiteName,
      metadata.url,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const rule of CLASSIFICATION_RULES) {
      if (rule.keywords.some((keyword) => textToSearch.includes(keyword))) {
        return rule.type;
      }
    }

    return "unknown";
  }
}
