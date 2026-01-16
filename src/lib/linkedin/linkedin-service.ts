import { createLogger } from "@/lib/logger";
import type {
  LinkedInImportItem,
  LinkedInProfileData,
  LinkedInScraperResult,
} from "@/types/linkedin";
import type { AllowedCategory } from "@/types/memory";

const logger = createLogger("linkedin-service");

const LINKEDIN_PROFILE_URL = "https://www.linkedin.com/in/me";
const SCRAPE_TIMEOUT = 30000; // 30 seconds

let linkedInService: LinkedInService | null = null;

export function getLinkedInService(): LinkedInService {
  if (!linkedInService) {
    linkedInService = new LinkedInService();
  }
  return linkedInService;
}

export function registerLinkedInService(): void {
  linkedInService = new LinkedInService();
}

export class LinkedInService {
  private scrapeTabId: number | null = null;
  private scrapeResolve: ((result: LinkedInScraperResult) => void) | null =
    null;

  constructor() {
    this.setupMessageListener();
  }

  private setupMessageListener(): void {
    browser.runtime.onMessage.addListener((message, sender) => {
      if (message.type === "LINKEDIN_SCRAPE_RESULT") {
        logger.debug("Received scrape result:", message);

        if (this.scrapeResolve) {
          this.scrapeResolve({
            success: message.success,
            data: message.data,
            error: message.error,
            requiresLogin: message.requiresLogin,
          });
          this.scrapeResolve = null;
        }

        // Close the tab if it was opened for scraping
        if (this.scrapeTabId && sender.tab?.id === this.scrapeTabId) {
          browser.tabs.remove(this.scrapeTabId).catch(() => {});
          this.scrapeTabId = null;
        }
      }
    });
  }

  async scrapeLinkedInProfile(): Promise<LinkedInScraperResult> {
    logger.debug("Starting LinkedIn profile scrape");

    return new Promise((resolve) => {
      this.scrapeResolve = resolve;

      // Set timeout
      const timeout = setTimeout(() => {
        if (this.scrapeResolve) {
          this.scrapeResolve({
            success: false,
            error: "Scraping timed out. Please try again.",
          });
          this.scrapeResolve = null;
        }

        if (this.scrapeTabId) {
          browser.tabs.remove(this.scrapeTabId).catch(() => {});
          this.scrapeTabId = null;
        }
      }, SCRAPE_TIMEOUT);

      // Open LinkedIn profile in a new tab
      browser.tabs
        .create({
          url: `${LINKEDIN_PROFILE_URL}?superfill_scrape=true`,
          active: false, // Open in background
        })
        .then((tab) => {
          if (tab.id) {
            this.scrapeTabId = tab.id;
            logger.debug("Opened LinkedIn tab:", tab.id);
          }
          // The content script will automatically scrape and send results
          // We wait for the message listener to receive the result
        })
        .catch((error) => {
          clearTimeout(timeout);
          logger.error("Failed to open LinkedIn tab:", error);
          resolve({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to open LinkedIn",
          });
        });
    });
  }

  async requestManualScrape(tabId: number): Promise<LinkedInScraperResult> {
    try {
      const response = await browser.tabs.sendMessage(tabId, {
        type: "LINKEDIN_SCRAPE_REQUEST",
      });
      return response as LinkedInScraperResult;
    } catch (error) {
      logger.error("Failed to request manual scrape:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to scrape profile",
      };
    }
  }

  convertToImportItems(profileData: LinkedInProfileData): LinkedInImportItem[] {
    const items: LinkedInImportItem[] = [];
    let idCounter = 0;

    const createItem = (
      label: string,
      question: string,
      answer: string,
      category: AllowedCategory,
      tags: string[],
      source: LinkedInImportItem["source"],
    ): LinkedInImportItem => ({
      id: `linkedin-${++idCounter}`,
      label,
      question,
      answer,
      category,
      tags,
      selected: true,
      source,
    });

    // Name
    if (profileData.name) {
      items.push(
        createItem(
          "Full Name",
          "What is your full name?",
          profileData.name,
          "personal",
          ["name", "personal"],
          "name",
        ),
      );
    }

    if (profileData.firstName) {
      items.push(
        createItem(
          "First Name",
          "What is your first name?",
          profileData.firstName,
          "personal",
          ["name", "personal", "first-name"],
          "name",
        ),
      );
    }

    if (profileData.lastName) {
      items.push(
        createItem(
          "Last Name",
          "What is your last name?",
          profileData.lastName,
          "personal",
          ["name", "personal", "last-name"],
          "name",
        ),
      );
    }

    // Headline
    if (profileData.headline) {
      items.push(
        createItem(
          "Professional Headline",
          "What is your professional headline or title?",
          profileData.headline,
          "work",
          ["headline", "professional", "title"],
          "headline",
        ),
      );
    }

    // Location
    if (profileData.location) {
      items.push(
        createItem(
          "Location",
          "Where are you located?",
          profileData.location,
          "location",
          ["location", "address"],
          "location",
        ),
      );
    }

    // About
    if (profileData.about) {
      items.push(
        createItem(
          "About / Bio",
          "Tell me about yourself",
          profileData.about,
          "personal",
          ["about", "bio", "summary"],
          "about",
        ),
      );
    }

    // Contact Info
    if (profileData.email) {
      items.push(
        createItem(
          "Email",
          "What is your email address?",
          profileData.email,
          "contact",
          ["email", "contact"],
          "contact",
        ),
      );
    }

    if (profileData.phone) {
      items.push(
        createItem(
          "Phone",
          "What is your phone number?",
          profileData.phone,
          "contact",
          ["phone", "contact"],
          "contact",
        ),
      );
    }

    if (profileData.website) {
      items.push(
        createItem(
          "Website",
          "What is your website?",
          profileData.website,
          "contact",
          ["website", "url", "contact"],
          "contact",
        ),
      );
    }

    // Experience - Current job
    const currentJob = profileData.experience.find((exp) => exp.isCurrent);
    if (currentJob) {
      if (currentJob.title) {
        items.push(
          createItem(
            "Current Job Title",
            "What is your current job title?",
            currentJob.title,
            "work",
            ["job", "title", "current"],
            "experience",
          ),
        );
      }

      if (currentJob.company) {
        items.push(
          createItem(
            "Current Company",
            "Where do you currently work?",
            currentJob.company,
            "work",
            ["company", "employer", "current"],
            "experience",
          ),
        );
      }
    }

    // All experience entries
    profileData.experience.forEach((exp, index) => {
      const prefix = exp.isCurrent ? "Current" : `Previous (${index + 1})`;
      const dateRange = [exp.startDate, exp.endDate]
        .filter(Boolean)
        .join(" - ");

      const experienceText = [
        exp.title,
        exp.company && `at ${exp.company}`,
        dateRange && `(${dateRange})`,
        exp.location,
      ]
        .filter(Boolean)
        .join(" ");

      if (experienceText) {
        items.push(
          createItem(
            `${prefix} Experience`,
            `Describe your ${prefix.toLowerCase()} work experience`,
            experienceText,
            "work",
            ["experience", "work", exp.isCurrent ? "current" : "previous"],
            "experience",
          ),
        );
      }
    });

    // Education
    profileData.education.forEach((edu, index) => {
      const educationText = [
        edu.degree,
        edu.fieldOfStudy && `in ${edu.fieldOfStudy}`,
        edu.school && `from ${edu.school}`,
        edu.startDate && edu.endDate && `(${edu.startDate} - ${edu.endDate})`,
      ]
        .filter(Boolean)
        .join(" ");

      if (educationText) {
        items.push(
          createItem(
            `Education ${index + 1}`,
            "Describe your educational background",
            educationText,
            "education",
            ["education", "school", "degree"],
            "education",
          ),
        );
      }

      // Also add individual fields
      if (edu.school) {
        items.push(
          createItem(
            `School/University ${index + 1}`,
            "What school or university did you attend?",
            edu.school,
            "education",
            ["school", "university", "education"],
            "education",
          ),
        );
      }

      if (edu.degree) {
        items.push(
          createItem(
            `Degree ${index + 1}`,
            "What degree did you earn?",
            edu.degree,
            "education",
            ["degree", "education"],
            "education",
          ),
        );
      }

      if (edu.fieldOfStudy) {
        items.push(
          createItem(
            `Field of Study ${index + 1}`,
            "What was your field of study or major?",
            edu.fieldOfStudy,
            "education",
            ["major", "field", "education"],
            "education",
          ),
        );
      }
    });

    // Skills
    if (profileData.skills.length > 0) {
      items.push(
        createItem(
          "Skills",
          "What are your professional skills?",
          profileData.skills.join(", "),
          "personal",
          ["skills", "abilities"],
          "skills",
        ),
      );

      // Top 5 individual skills
      profileData.skills.slice(0, 5).forEach((skill) => {
        items.push(
          createItem(
            `Skill: ${skill}`,
            `Do you have experience with ${skill}?`,
            skill,
            "personal",
            ["skill", skill.toLowerCase()],
            "skills",
          ),
        );
      });
    }

    return items;
  }
}
