import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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
  toggleTheme: () => void;
  setTrigger: (trigger: Trigger) => void;
};

export const useUISettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set, get) => {
      const unwatchUISettings = storage.uiSettings.watch((newSettings) => {
        if (newSettings !== null) {
          logger.info("UI settings updated from storage:", newSettings);
          set({
            theme: newSettings.theme,
            trigger: newSettings.trigger,
          });
        }
      });

      if (typeof window !== "undefined") {
        (window as any).__uiSettingsStoreCleanup = () => {
          unwatchUISettings();
        };
      }

      return {
        theme: Theme.DEFAULT,
        trigger: Trigger.POPUP,
        loading: false,
        error: null,

        toggleTheme: () => {
          try {
            set({ loading: true, error: null });
            const currentTheme = get().theme;
            const newTheme =
              currentTheme === Theme.LIGHT
                ? Theme.DARK
                : currentTheme === Theme.DARK
                  ? Theme.DEFAULT
                  : Theme.LIGHT;
            set({ theme: newTheme, loading: false });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Failed to toggle theme";
            logger.error("Toggle theme error:", error);
            set({ loading: false, error: errorMessage });
            throw error;
          }
        },

        setTrigger: (trigger: Trigger) => {
          try {
            set({ loading: true, error: null });
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
    {
      name: "ui-settings-storage",
      storage: createJSONStorage(() => ({
        getItem: async () => {
          try {
            const uiSettings = await storage.uiSettings.getValue();

            return JSON.stringify({
              state: {
                ...uiSettings,
                loading: false,
                error: null,
              },
            });
          } catch (error) {
            logger.error("Failed to load UI settings data:", error);
            return null;
          }
        },
        setItem: async (_name: string, value: string) => {
          try {
            const parsed = JSON.parse(value);

            if (!parsed || typeof parsed !== "object" || !("state" in parsed)) {
              logger.warn("Invalid UI settings data structure, skipping save");
              return;
            }

            const { state } = parsed as { state: UISettings };

            if (!state) {
              logger.warn("No state in parsed UI settings data, skipping save");
              return;
            }

            await storage.uiSettings.setValue(state);
          } catch (error) {
            logger.error("Failed to save UI settings data:", error);
          }
        },
        removeItem: async () => {
          await storage.uiSettings.setValue({
            theme: Theme.DEFAULT,
            trigger: Trigger.POPUP,
          });
        },
      })),
    },
  ),
);
