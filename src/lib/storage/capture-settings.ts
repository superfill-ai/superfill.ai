import { storage } from "@/lib/storage";
import type { CaptureSettings } from "./data";

export async function getCaptureSettings(): Promise<CaptureSettings> {
  return await storage.captureSettings.getValue();
}

export async function updateCaptureSettings(
  updates: Partial<CaptureSettings>,
): Promise<void> {
  const current = await getCaptureSettings();
  await storage.captureSettings.setValue({ ...current, ...updates });
}

export async function addNeverAskSite(domain: string): Promise<void> {
  const current = await getCaptureSettings();
  if (!current.neverAskSites.includes(domain)) {
    await storage.captureSettings.setValue({
      ...current,
      neverAskSites: [...current.neverAskSites, domain],
    });
  }
}

export async function removeNeverAskSite(domain: string): Promise<void> {
  const current = await getCaptureSettings();
  await storage.captureSettings.setValue({
    ...current,
    neverAskSites: current.neverAskSites.filter((d) => d !== domain),
  });
}

export function isSiteBlocked(
  hostname: string,
  settings: CaptureSettings,
): boolean {
  const domain = hostname.toLowerCase();

  if (
    settings.neverAskSites.some(
      (site) => domain === site || domain.endsWith(`.${site}`),
    )
  ) {
    return true;
  }

  return settings.blockedDomains.some(
    (blocked) => domain === blocked || domain.endsWith(`.${blocked}`),
  );
}

export function isChatInterface(): boolean {
  const inputs = document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >('input[type="text"], textarea');

  // More than one input field usually indicates a form, not chat
  if (inputs.length !== 1) {
    return false;
  }

  const hasLogRole = document.querySelector('[role="log"]') !== null;
  const hasChatClass = document.querySelector('[class*="chat" i]') !== null;
  const hasMessagesClass =
    document.querySelector('[class*="message" i]') !== null;

  const hasChatContainer =
    document.querySelector('[id*="chat" i]') !== null ||
    document.querySelector('[data-testid*="chat" i]') !== null;

  return hasLogRole || hasChatClass || hasMessagesClass || hasChatContainer;
}
