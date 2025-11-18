import type { UISettings } from "@/types/settings";
import { Theme } from "@/types/theme";
import { Trigger } from "@/types/trigger";

export const uiSettings = storage.defineItem<UISettings>(
  "local:settings:ui-settings",
  {
    fallback: {
      theme: Theme.DEFAULT,
      trigger: Trigger.POPUP,
      onboardingCompleted: false,
    },
    version: 3,
  },
);
