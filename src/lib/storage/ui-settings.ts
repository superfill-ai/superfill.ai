import type { UISettings } from "@/types/settings";
import { Theme } from "@/types/theme";

export const uiSettings = storage.defineItem<UISettings>(
  "local:settings:ui-settings",
  {
    fallback: {
      theme: Theme.DEFAULT,
      onboardingCompleted: false,
      extensionVersion: "0.0.0",
      completedTours: [],
      lastTourCompletedAt: undefined,
      rightClickGuideSnoozedUntil: undefined,
      rightClickGuideDismissed: false,
    },
    version: 4,
  },
);
