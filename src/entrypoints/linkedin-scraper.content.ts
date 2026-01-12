import { createLogger } from "@/lib/logger";
import type {
  LinkedInEducation,
  LinkedInExperience,
  LinkedInProfileData,
} from "@/types/linkedin";

const logger = createLogger("linkedin-scraper");

function _getTextContent(
  selector: string,
  parent: Element | Document = document,
): string | undefined {
  const element = parent.querySelector(selector);
  return element?.textContent?.trim() || undefined;
}

function _getVisibleText(element: Element | null): string {
  if (!element) return "";

  // Get text from aria-hidden spans (LinkedIn's pattern for visible text)
  const ariaHiddenSpan = element.querySelector('span[aria-hidden="true"]');
  if (ariaHiddenSpan) {
    return ariaHiddenSpan.textContent?.trim() || "";
  }

  // Fallback to direct text content
  return element.textContent?.trim() || "";
}

function extractName(): {
  name?: string;
  firstName?: string;
  lastName?: string;
} {
  // LinkedIn 2024+ selectors for name
  const nameSelectors = [
    "h1.text-heading-xlarge",
    "h1.inline.t-24",
    ".pv-top-card h1",
    ".ph5 h1",
    "section.artdeco-card h1",
  ];

  for (const selector of nameSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const name = element.textContent?.trim();
      if (name) {
        const parts = name.split(" ");
        return {
          name,
          firstName: parts[0],
          lastName: parts.slice(1).join(" ") || undefined,
        };
      }
    }
  }

  return {};
}

function extractHeadline(): string | undefined {
  const headlineSelectors = [
    ".text-body-medium.break-words",
    ".pv-top-card .text-body-medium",
    ".ph5 .text-body-medium",
    "div.text-body-medium",
  ];

  for (const selector of headlineSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const headline = element.textContent?.trim();
      if (headline) return headline;
    }
  }

  return undefined;
}

function extractLocation(): string | undefined {
  // Location is typically in the top card area
  const locationSelectors = [
    ".pv-text-details__left-panel .text-body-small",
    ".ph5 .text-body-small",
    ".mt2 .text-body-small",
  ];

  for (const selector of locationSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent?.trim();
      // Filter out connection counts, followers, and other non-location text
      if (
        text &&
        !text.includes("connection") &&
        !text.includes("follower") &&
        !text.includes("Contact info") &&
        !text.match(/^\d+/) // Skip numbers like "500+ connections"
      ) {
        return text;
      }
    }
  }

  return undefined;
}

function extractAbout(): string | undefined {
  // Find the About section
  const sections = document.querySelectorAll("section.artdeco-card");

  for (const section of sections) {
    const sectionId = section.querySelector('[id*="about"]');
    const heading = section.querySelector("h2");

    if (sectionId || heading?.textContent?.toLowerCase().includes("about")) {
      // Look for the about text content
      const aboutText = section.querySelector(
        '.pv-shared-text-with-see-more span[aria-hidden="true"], ' +
          '.inline-show-more-text span[aria-hidden="true"], ' +
          '.display-flex.full-width span[aria-hidden="true"]',
      );

      if (aboutText) {
        return aboutText.textContent?.trim();
      }

      // Fallback: get any substantial text in the section
      const paragraphs = section.querySelectorAll(
        "span.visually-hidden + span",
      );
      for (const p of paragraphs) {
        const text = p.textContent?.trim();
        if (text && text.length > 50) {
          return text;
        }
      }
    }
  }

  return undefined;
}

function findSectionByTitle(titleKeyword: string): Element | null {
  // Method 1: Look for section with ID containing the keyword
  const sectionById = document.querySelector(
    `section[id*="${titleKeyword}"], div[id*="${titleKeyword}"]`,
  );
  if (sectionById) {
    const parentSection =
      sectionById.closest("section.artdeco-card") ||
      sectionById.closest("section");
    if (parentSection) return parentSection;
  }

  // Method 2: Look for section with heading containing the keyword
  const sections = document.querySelectorAll("section.artdeco-card, section");
  for (const section of sections) {
    const headings = section.querySelectorAll("h2, .pvs-header__title span");
    for (const heading of headings) {
      if (
        heading.textContent?.toLowerCase().includes(titleKeyword.toLowerCase())
      ) {
        return section;
      }
    }
  }

  // Method 3: Look for anchor with the ID
  const anchor = document.querySelector(`#${titleKeyword}`);
  if (anchor) {
    return anchor.closest("section.artdeco-card") || anchor.closest("section");
  }

  return null;
}

function extractExperience(): LinkedInExperience[] {
  const experiences: LinkedInExperience[] = [];

  const experienceSection = findSectionByTitle("experience");
  if (!experienceSection) {
    logger.debug("Experience section not found");
    return experiences;
  }

  logger.debug("Found experience section");

  // Find all experience list items - LinkedIn uses a list structure
  const listItems = experienceSection.querySelectorAll(
    "li.artdeco-list__item, " +
      ".pvs-list__paged-list-item, " +
      "ul.pvs-list > li",
  );

  logger.debug(`Found ${listItems.length} experience items`);

  for (const item of listItems) {
    const experience: LinkedInExperience = {
      title: "",
      company: "",
    };

    // Get all text containers in this item
    const textContainers = item.querySelectorAll(
      ".display-flex.flex-column, .pvs-entity",
    );

    if (textContainers.length === 0) {
      // Try alternative structure
      const spans = item.querySelectorAll('span[aria-hidden="true"]');
      if (spans.length >= 2) {
        experience.title = spans[0]?.textContent?.trim() || "";
        experience.company =
          spans[1]?.textContent?.trim().split("·")[0].trim() || "";
        if (spans.length >= 3) {
          const dateText = spans[2]?.textContent?.trim() || "";
          const dateParts = dateText.split(" - ");
          experience.startDate = dateParts[0]?.trim();
          experience.endDate = dateParts[1]?.split("·")[0]?.trim();
          experience.isCurrent =
            experience.endDate?.toLowerCase() === "present";
        }
      }
    } else {
      // Standard structure with flex containers
      for (const container of textContainers) {
        const boldText = container.querySelector(
          '.t-bold span[aria-hidden="true"], .mr1.t-bold span[aria-hidden="true"]',
        );
        const normalText = container.querySelector(
          '.t-normal:not(.t-black--light) span[aria-hidden="true"], .t-14.t-normal span[aria-hidden="true"]',
        );
        const lightText = container.querySelector(
          '.t-black--light span[aria-hidden="true"], .t-14.t-normal.t-black--light span[aria-hidden="true"]',
        );

        if (boldText && !experience.title) {
          experience.title = boldText.textContent?.trim() || "";
        }
        if (normalText && !experience.company) {
          experience.company =
            normalText.textContent?.trim().split("·")[0].trim() || "";
        }
        if (lightText) {
          const dateText = lightText.textContent?.trim() || "";
          if (
            dateText.includes("-") ||
            dateText.toLowerCase().includes("present")
          ) {
            const dateParts = dateText.split(" - ");
            experience.startDate = dateParts[0]?.trim();
            experience.endDate = dateParts[1]?.split("·")[0]?.trim();
            experience.isCurrent =
              experience.endDate?.toLowerCase() === "present";
          } else if (!experience.location) {
            experience.location = dateText;
          }
        }
      }
    }

    // Only add if we have meaningful data
    if (experience.title || experience.company) {
      experiences.push(experience);
      logger.debug("Added experience:", experience);
    }
  }

  return experiences;
}

function extractEducation(): LinkedInEducation[] {
  const educationList: LinkedInEducation[] = [];

  const educationSection = findSectionByTitle("education");
  if (!educationSection) {
    logger.debug("Education section not found");
    return educationList;
  }

  logger.debug("Found education section");

  // Find all education list items
  const listItems = educationSection.querySelectorAll(
    "li.artdeco-list__item, " +
      ".pvs-list__paged-list-item, " +
      "ul.pvs-list > li",
  );

  logger.debug(`Found ${listItems.length} education items`);

  for (const item of listItems) {
    const education: LinkedInEducation = {
      school: "",
    };

    // Try to get structured data
    const spans = item.querySelectorAll('span[aria-hidden="true"]');

    if (spans.length >= 1) {
      // First span is usually the school name
      education.school = spans[0]?.textContent?.trim() || "";
    }

    if (spans.length >= 2) {
      // Second span is usually degree info
      const degreeText = spans[1]?.textContent?.trim() || "";
      const degreeParts = degreeText.split(",");
      education.degree = degreeParts[0]?.trim();
      if (degreeParts.length > 1) {
        education.fieldOfStudy = degreeParts.slice(1).join(",").trim();
      }
    }

    if (spans.length >= 3) {
      // Third span might be dates
      const dateText = spans[2]?.textContent?.trim() || "";
      if (dateText.includes("-") || dateText.match(/\d{4}/)) {
        const dateParts = dateText.split(" - ");
        education.startDate = dateParts[0]?.trim();
        education.endDate = dateParts[1]?.trim();
      }
    }

    // Only add if we have school name
    if (education.school) {
      educationList.push(education);
      logger.debug("Added education:", education);
    }
  }

  return educationList;
}

function extractSkills(): string[] {
  const skills: string[] = [];

  const skillsSection = findSectionByTitle("skill");
  if (!skillsSection) {
    logger.debug("Skills section not found");
    return skills;
  }

  logger.debug("Found skills section");

  // Find all skill items
  const skillItems = skillsSection.querySelectorAll(
    "li.artdeco-list__item, " +
      ".pvs-list__paged-list-item, " +
      "ul.pvs-list > li",
  );

  for (const item of skillItems) {
    // Get the skill name from bold text or first span
    const boldSpan = item.querySelector(
      '.t-bold span[aria-hidden="true"], .mr1.t-bold span[aria-hidden="true"]',
    );
    const firstSpan = item.querySelector('span[aria-hidden="true"]');

    const skillName =
      boldSpan?.textContent?.trim() || firstSpan?.textContent?.trim();

    if (skillName && !skills.includes(skillName) && skillName.length < 100) {
      skills.push(skillName);
    }
  }

  logger.debug(`Extracted ${skills.length} skills`);
  return skills;
}

function extractContactInfo(): {
  email?: string;
  phone?: string;
  website?: string;
} {
  const contact: { email?: string; phone?: string; website?: string } = {};

  // Check for email links
  const emailLinks = document.querySelectorAll('a[href^="mailto:"]');
  for (const link of emailLinks) {
    const href = link.getAttribute("href");
    if (href) {
      contact.email = href.replace("mailto:", "").split("?")[0];
      break;
    }
  }

  // Check for phone links
  const phoneLinks = document.querySelectorAll('a[href^="tel:"]');
  for (const link of phoneLinks) {
    const href = link.getAttribute("href");
    if (href) {
      contact.phone = href.replace("tel:", "");
      break;
    }
  }

  // Check for website links in contact section
  // We already have profile URL, look for external websites
  const externalLinks = document.querySelectorAll(
    'section a[href^="http"]:not([href*="linkedin.com"])',
  );
  for (const link of externalLinks) {
    const href = link.getAttribute("href");
    if (href && !href.includes("linkedin.com")) {
      contact.website = href;
      break;
    }
  }

  return contact;
}

function isLoginPage(): boolean {
  const loginIndicators = [
    document.querySelector('form[action*="login"]'),
    document.querySelector('input[name="session_key"]'),
    document.querySelector(".sign-in-form"),
    document.querySelector('[data-id="sign-in-form"]'),
    document.querySelector(".login__form"),
  ];

  return loginIndicators.some((el) => el !== null);
}

function isProfilePage(): boolean {
  const profileIndicators = [
    document.querySelector(".pv-top-card"),
    document.querySelector("section.artdeco-card"),
    document.querySelector(".scaffold-layout__main"),
    window.location.pathname.startsWith("/in/"),
  ];

  return profileIndicators.some((indicator) => indicator);
}

function scrapeProfile(): LinkedInProfileData {
  logger.debug("Starting profile scrape...");

  const { name, firstName, lastName } = extractName();
  logger.debug("Extracted name:", { name, firstName, lastName });

  const headline = extractHeadline();
  logger.debug("Extracted headline:", headline);

  const location = extractLocation();
  logger.debug("Extracted location:", location);

  const about = extractAbout();
  logger.debug("Extracted about:", about?.substring(0, 100));

  const experience = extractExperience();
  logger.debug("Extracted experience count:", experience.length);

  const education = extractEducation();
  logger.debug("Extracted education count:", education.length);

  const skills = extractSkills();
  logger.debug("Extracted skills count:", skills.length);

  const contact = extractContactInfo();
  logger.debug("Extracted contact:", contact);

  return {
    name,
    firstName,
    lastName,
    headline,
    location,
    about,
    profileUrl: window.location.href,
    email: contact.email,
    phone: contact.phone,
    website: contact.website,
    experience,
    education,
    skills,
  };
}

export default defineContentScript({
  matches: ["https://www.linkedin.com/in/*"],
  runAt: "document_idle",

  async main() {
    logger.debug("LinkedIn scraper content script loaded");

    // Listen for scrape requests from background
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "LINKEDIN_SCRAPE_REQUEST") {
        logger.debug("Received scrape request");

        if (isLoginPage()) {
          logger.debug("User needs to log in");
          sendResponse({
            success: false,
            requiresLogin: true,
            error: "Please log in to LinkedIn first",
          });
          return true;
        }

        if (!isProfilePage()) {
          logger.debug("Not on a profile page");
          sendResponse({
            success: false,
            error: "Please navigate to your LinkedIn profile",
          });
          return true;
        }

        try {
          const profileData = scrapeProfile();
          logger.debug("Scraped profile data:", profileData);

          sendResponse({
            success: true,
            data: profileData,
          });
        } catch (error) {
          logger.error("Error scraping profile:", error);
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to scrape profile",
          });
        }

        return true;
      }

      return false;
    });

    // If this tab was opened for scraping, automatically send data back
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("superfill_scrape") === "true") {
      logger.debug("Auto-scrape mode detected");

      // Wait longer for the page to fully load (LinkedIn is heavy)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Scroll down to trigger lazy loading of sections
      window.scrollTo(0, document.body.scrollHeight / 2);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (isLoginPage()) {
        browser.runtime.sendMessage({
          type: "LINKEDIN_SCRAPE_RESULT",
          success: false,
          requiresLogin: true,
          error: "Please log in to LinkedIn",
        });
      } else {
        try {
          const profileData = scrapeProfile();
          browser.runtime.sendMessage({
            type: "LINKEDIN_SCRAPE_RESULT",
            success: true,
            data: profileData,
          });
        } catch (error) {
          browser.runtime.sendMessage({
            type: "LINKEDIN_SCRAPE_RESULT",
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to scrape profile",
          });
        }
      }
    }
  },
});
