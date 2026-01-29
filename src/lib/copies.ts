import type { TrackableFieldType } from "@/types/autofill";
import type { AllowedCategory } from "@/types/memory";

export const allowedCategories = [
  "contact",
  "general",
  "location",
  "work",
  "personal",
  "education",
] as const;

export function isAllowedCategory(value: string): value is AllowedCategory {
  return allowedCategories.includes(value as AllowedCategory);
}

export const TRACKABLE_FIELD_TYPES = [
  "text",
  "email",
  "tel",
  "textarea",
  "url",
] as const;

export function isTrackableFieldType(
  value: string,
): value is TrackableFieldType {
  return TRACKABLE_FIELD_TYPES.includes(value as TrackableFieldType);
}

export const MESSAGING_SITE_BLOCKLIST_DOMAINS = [
  // Chat & Messaging
  "discord.com",
  "web.whatsapp.com",
  "whatsapp.com",
  "slack.com",
  "teams.microsoft.com",
  "web.telegram.org",
  "telegram.org",
  "messenger.com",
  "signal.org",

  // Social Media Messaging
  "reddit.com",

  // Project Management & Collaboration (often have chat/comments)
  "linear.app",
  "notion.so",
  "clickup.com",
  "asana.com",
  "monday.com",
  "github.com",
  "gitlab.com",

  // Other Chat Platforms
  "chat.google.com",
  "hangouts.google.com",
  "skype.com",
  "zoom.us",
  "meet.google.com",
  "webex.com",
] as const;

export const MESSAGING_SITE_BLOCKLIST_PATHS = [
  { domain: "facebook.com", path: "/messages" },
  { domain: "twitter.com", path: "/messages" },
  { domain: "x.com", path: "/messages" },
  { domain: "reddit.com", path: "/chat" },
  { domain: "linkedin.com", path: "/messaging" },
  { domain: "instagram.com", path: "/direct" },
] as const;

export function isMessagingSite(hostname: string, pathname: string): boolean {
  const lowerHostname = hostname.toLowerCase();
  const lowerPathname = pathname.toLowerCase();

  if (
    MESSAGING_SITE_BLOCKLIST_DOMAINS.some((domain) =>
      lowerHostname.includes(domain),
    )
  ) {
    return true;
  }

  return MESSAGING_SITE_BLOCKLIST_PATHS.some(
    (entry) =>
      lowerHostname.includes(entry.domain) &&
      lowerPathname.startsWith(entry.path),
  );
}

export function isElementPartOfForm(element: HTMLElement): boolean {
  const countInputs = (root: ParentNode): number => {
    const inputs = root.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]:not([contenteditable="false"])',
    );
    return inputs.length;
  };

  if (countInputs(document) < 2) return false;

  const formParent = element.closest('form, [role="form"], [data-form], .form');
  if (formParent) {
    return countInputs(formParent) >= 2;
  }

  const container = element.closest("div, section, main, aside");
  if (container) {
    return countInputs(container) >= 2;
  }

  return false;
}
