import { browser } from "wxt/browser";
import type { ToastType } from "@/components/ui/sonner";
import {
  contentAutofillMessaging,
  type ShowToastData,
} from "@/lib/autofill/content-autofill-messaging";

export async function showToast(
  tabId: number,
  message: string,
  type: ToastType = "info",
  options?: {
    duration?: number;
    action?: { label: string; url: string };
  },
): Promise<boolean> {
  try {
    const data: ShowToastData = {
      message,
      type,
      duration: options?.duration,
      action: options?.action,
    };

    return await contentAutofillMessaging.sendMessage("showToast", data, tabId);
  } catch {
    return false;
  }
}

export async function showCloudLimitReachedToast(
  tabId: number,
  hasBYOK: boolean,
): Promise<boolean> {
  const message = hasBYOK
    ? "Cloud AI limit reached. Switched to your local AI provider."
    : "Cloud AI limit reached. Configure an API key or upgrade your plan.";

  return showToast(tabId, message, "warning", {
    duration: 6000,
    action: {
      label: hasBYOK ? "Upgrade Plan" : "Configure API Key",
      url: hasBYOK
        ? `${import.meta.env.WXT_WEBSITE_URL || "https://superfill.ai"}/settings/subscription`
        : browser.runtime.getURL("/options.html"),
    },
  });
}
