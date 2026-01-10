import { storage } from "@/lib/storage";
import type { CaptureSettings } from "./data";

const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  enabled: true,
  blockedDomains: [],
  neverAskSites: [],
};

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");
}

export async function getCaptureSettings(): Promise<CaptureSettings> {
  try {
    const raw = await storage.captureSettings.getValue();
    return {
      ...DEFAULT_CAPTURE_SETTINGS,
      ...raw,
      enabled:
        typeof raw?.enabled === "boolean"
          ? raw.enabled
          : DEFAULT_CAPTURE_SETTINGS.enabled,
      blockedDomains: Array.isArray(raw?.blockedDomains)
        ? raw.blockedDomains.map(normalizeDomain).filter(Boolean)
        : DEFAULT_CAPTURE_SETTINGS.blockedDomains,
      neverAskSites: Array.isArray(raw?.neverAskSites)
        ? raw.neverAskSites.map(normalizeDomain).filter(Boolean)
        : DEFAULT_CAPTURE_SETTINGS.neverAskSites,
    };
  } catch {
    throw new Error("Failed to read capture settings.");
  }
}
export async function updateCaptureSettings(
  updates: Partial<CaptureSettings>,
): Promise<void> {
  try {
    const current = await getCaptureSettings();
    await storage.captureSettings.setValue({ ...current, ...updates });
  } catch {
    throw new Error("Failed to update capture settings.");
  }
}

export async function addNeverAskSite(domain: string): Promise<void> {
  try {
    const current = await getCaptureSettings();
    const normalized = normalizeDomain(domain);

    if (!normalized) return;
    if (!current.neverAskSites.includes(normalized)) {
      await storage.captureSettings.setValue({
        ...current,
        neverAskSites: [...current.neverAskSites, normalized],
      });
    }
  } catch {
    throw new Error("Failed to add site to never-ask list.");
  }
}

export async function removeNeverAskSite(domain: string): Promise<void> {
  try {
    const current = await getCaptureSettings();
    const normalized = normalizeDomain(domain);

    await storage.captureSettings.setValue({
      ...current,
      neverAskSites: current.neverAskSites.filter((d) => d !== normalized),
    });
  } catch {
    throw new Error("Failed to remove site from never-ask list.");
  }
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
