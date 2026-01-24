import type { UISettings } from "@superfill/shared/types/settings";
import { Theme } from "@superfill/shared/types/theme";

export const uiSettings = storage.defineItem<UISettings>(
  "local:settings:ui-settings",
  {
    fallback: {
      theme: Theme.DEFAULT,
      onboardingCompleted: false,
      extensionVersion: "0.0.0",
      completedTours: [],
      lastTourCompletedAt: undefined,
    },
    version: 4,
  },
);
