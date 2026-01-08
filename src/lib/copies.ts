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

export const MESSAGING_SITE_BLOCKLIST = [
  // Chat & Messaging
  "discord.com",
  "web.whatsapp.com",
  "whatsapp.com",
  "slack.com",
  "teams.microsoft.com",
  "web.telegram.org",
  "telegram.org",
  "messenger.com",
  "facebook.com/messages",
  "signal.org",

  // Social Media Messaging
  "twitter.com/messages",
  "x.com/messages",
  "reddit.com/chat",
  "linkedin.com/messaging",
  "instagram.com/direct",

  // Other Chat Platforms
  "chat.google.com",
  "hangouts.google.com",
  "skype.com",
  "zoom.us",
  "meet.google.com",
  "webex.com",
] as const;
