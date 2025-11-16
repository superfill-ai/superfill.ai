import { create } from "zustand";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { UISettings } from "@/types/settings";
import { Theme } from "@/types/theme";
import { Trigger } from "@/types/trigger";

const logger = createLogger("store:ui-settings");

type SettingsState = {
  theme: Theme;
  trigger: Trigger;
  loading: boolean;
  error: string | null;
};

type SettingsActions = {
  toggleTheme: () => Promise<void>;
  setTrigger: (trigger: Trigger) => Promise<void>;
};

let unwatchUiSettings: (() => void) | undefined;

export const useUISettingsStore = create<SettingsState & SettingsActions>()(
  (set, get) => {
    // Initialize from storage
    storage.uiSettings.getValue().then((settings) => {
      set({
        theme: settings.theme,
        trigger: settings.trigger,
      });
    });

    // Watch for external changes
    if (!unwatchUiSettings) {
      unwatchUiSettings = storage.uiSettings.watch((newSettings) => {
        if (newSettings !== null) {
          set({
            theme: newSettings.theme,
            trigger: newSettings.trigger,
          });
        }
      });
    }

    return {
      theme: Theme.DEFAULT,
      trigger: Trigger.POPUP,
      loading: false,
      error: null,

      toggleTheme: async () => {
        try {
          set({ loading: true, error: null });
          const currentTheme = get().theme;
          const newTheme =
            currentTheme === Theme.LIGHT
              ? Theme.DARK
              : currentTheme === Theme.DARK
                ? Theme.DEFAULT
                : Theme.LIGHT;

          const currentSettings = await storage.uiSettings.getValue();
          const updatedSettings: UISettings = {
            ...currentSettings,
            theme: newTheme,
          };

          await storage.uiSettings.setValue(updatedSettings);
          set({ theme: newTheme, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to toggle theme";
          logger.error("Toggle theme error:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setTrigger: async (trigger: Trigger) => {
        try {
          set({ loading: true, error: null });

          const currentSettings = await storage.uiSettings.getValue();
          const updatedSettings: UISettings = {
            ...currentSettings,
            trigger,
          };

          await storage.uiSettings.setValue(updatedSettings);
          set({ trigger, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set trigger";
          logger.error("Set trigger error:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },
    };
  },
);

export const cleanupUISettingsWatchers = () => {
  unwatchUiSettings?.();
  unwatchUiSettings = undefined;
};

if (import.meta.hot) {
  import.meta.hot.dispose(cleanupUISettingsWatchers);
}
