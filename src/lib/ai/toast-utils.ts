import {
  contentAutofillMessaging,
  type ShowToastData,
  type ToastType,
} from "@/lib/autofill/content-autofill-messaging";

export type { ToastType };

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
): Promise<boolean> {
  return showToast(
    tabId,
    "Cloud AI limit reached. Using your local AI model.",
    "warning",
    {
      duration: 6000,
      action: {
        label: "Upgrade Plan",
        url: `${import.meta.env.WXT_WEBSITE_URL || "https://superfill.ai"}/settings/subscription`,
      },
    },
  );
}
