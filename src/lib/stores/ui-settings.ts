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
  toggleTheme: () => Promise<void>;
  setTrigger: (trigger: Trigger) => Promise<void>;
};

export const useUISettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set, get) => ({
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
          await storage.uiSettings.setValue({
            ...(await storage.uiSettings.getValue()),
            trigger,
          });
          set({ trigger, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set trigger";
          logger.error("Set trigger error:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },
    }),
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
            logger.error("Failed to load form data:", error);
            return null;
          }
        },
        setItem: async (_name: string, value: string) => {
          try {
            const parsed = JSON.parse(value);

            if (!parsed || typeof parsed !== "object" || !("state" in parsed)) {
              logger.warn("Invalid form data structure, skipping save");
              return;
            }

            const { state } = parsed as { state: UISettings };

            if (!state) {
              logger.warn("No state in parsed form data, skipping save");
              return;
            }

            await storage.uiSettings.setValue(state);
          } catch (error) {
            logger.error("Failed to save form data:", error);
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
