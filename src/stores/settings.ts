import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createLogger } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import { keyVault } from "@/lib/security/key-vault";
import { store } from "@/lib/storage";
import type { AISettings } from "@/types/settings";
import { Theme } from "@/types/theme";
import { Trigger } from "@/types/trigger";

const logger = createLogger("store:settings");

type SettingsState = {
  theme: Theme;
  trigger: Trigger;
  selectedProvider?: AIProvider;
  selectedModels: Partial<Record<AIProvider, string>>;
  autoFillEnabled: boolean;
  autopilotMode: boolean;
  confidenceThreshold: number;
  loading: boolean;
  error: string | null;
};

type SettingsActions = {
  setTheme: (theme: Theme) => Promise<void>;
  toggleTheme: () => Promise<void>;
  setTrigger: (trigger: Trigger) => Promise<void>;
  setSelectedProvider: (provider: AIProvider) => Promise<void>;
  setSelectedModel: (provider: AIProvider, model: string) => Promise<void>;
  setAutoFillEnabled: (enabled: boolean) => Promise<void>;
  setAutopilotMode: (enabled: boolean) => Promise<void>;
  setConfidenceThreshold: (threshold: number) => Promise<void>;
  setApiKey: (provider: AIProvider, key: string) => Promise<void>;
  getApiKey: (provider: AIProvider) => Promise<string | null>;
  deleteApiKey: (provider: AIProvider) => Promise<void>;
  updateAISettings: (settings: Partial<AISettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
};

const defaultSettings: SettingsState = {
  theme: Theme.DEFAULT,
  trigger: Trigger.POPUP,
  selectedModels: {},
  autoFillEnabled: true,
  autopilotMode: false,
  confidenceThreshold: 0.6,
  loading: false,
  error: null,
};

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setTheme: async (theme: Theme) => {
        try {
          set({ loading: true, error: null });
          set({ theme, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set theme";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

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
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setTrigger: async (trigger: Trigger) => {
        try {
          set({ loading: true, error: null });
          set({ trigger, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set trigger";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setSelectedProvider: async (provider: AIProvider) => {
        try {
          set({ loading: true, error: null });
          set({ selectedProvider: provider, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set provider";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setSelectedModel: async (provider: AIProvider, model: string) => {
        try {
          set({ loading: true, error: null });
          const currentModels = get().selectedModels;
          const updatedModels = { ...currentModels, [provider]: model };
          set({ selectedModels: updatedModels, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set model";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setAutoFillEnabled: async (enabled: boolean) => {
        try {
          set({ loading: true, error: null });
          set({ autoFillEnabled: enabled, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set auto-fill";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setAutopilotMode: async (enabled: boolean) => {
        try {
          set({ loading: true, error: null });
          set({ autopilotMode: enabled, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to set autopilot mode";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setConfidenceThreshold: async (threshold: number) => {
        try {
          set({ loading: true, error: null });
          set({ confidenceThreshold: threshold, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to set confidence threshold";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      updateAISettings: async (settings: Partial<AISettings>) => {
        try {
          set({ loading: true, error: null });
          set({ ...settings, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to update settings";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setApiKey: async (provider, key) => {
        try {
          set({ loading: true, error: null });

          if (await keyVault.validateKey(provider, key)) {
            await keyVault.storeKey(provider, key);
            set({ selectedProvider: provider, loading: false });
          } else {
            set({ loading: false, error: "Invalid API key" });
            throw new Error("Invalid API key");
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set API key";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      getApiKey: async (provider) => {
        return keyVault.getKey(provider);
      },

      deleteApiKey: async (provider) => {
        try {
          set({ loading: true, error: null });
          await keyVault.deleteKey(provider);
          set({ loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to delete API key";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      resetSettings: async () => {
        try {
          set({ loading: true, error: null });
          set({ ...defaultSettings, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to reset settings";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },
    }),
    {
      name: "settings-storage",
      storage: createJSONStorage(() => ({
        getItem: async () => {
          try {
            const [theme, trigger, aiSettings] = await Promise.all([
              store.theme.getValue(),
              store.trigger.getValue(),
              store.aiSettings.getValue(),
            ]);

            return JSON.stringify({
              state: {
                theme,
                trigger,
                selectedProvider: aiSettings.selectedProvider,
                selectedModels: aiSettings.selectedModels || {},
                autoFillEnabled: aiSettings.autoFillEnabled,
                autopilotMode: aiSettings.autopilotMode,
                confidenceThreshold: aiSettings.confidenceThreshold,
                loading: false,
                error: null,
              },
            });
          } catch (error) {
            logger.error("Failed to load settings:", error);
            // Return null to use default state
            return null;
          }
        },
        setItem: async (_name: string, value: string) => {
          try {
            const parsed = JSON.parse(value);
            if (!parsed || typeof parsed !== "object" || !("state" in parsed)) {
              logger.warn("Invalid settings data structure, skipping save");
              return;
            }

            const { state } = parsed as { state: SettingsState };
            if (!state) {
              logger.warn("No state in parsed settings, skipping save");
              return;
            }

            await Promise.all([
              store.theme.setValue(state.theme),
              store.trigger.setValue(state.trigger),
              store.aiSettings.setValue({
                selectedProvider: state.selectedProvider,
                selectedModels: state.selectedModels,
                autoFillEnabled: state.autoFillEnabled,
                autopilotMode: state.autopilotMode,
                confidenceThreshold: state.confidenceThreshold,
              }),
            ]);
          } catch (error) {
            logger.error("Failed to save settings:", error);
            // Don't throw, just log - this prevents initialization errors
          }
        },
        removeItem: async () => {
          await Promise.all([
            store.theme.setValue(Theme.DEFAULT),
            store.trigger.setValue(Trigger.POPUP),
            store.aiSettings.setValue({
              selectedProvider: undefined,
              selectedModels: {},
              autoFillEnabled: true,
              autopilotMode: false,
              confidenceThreshold: 0.6,
            }),
          ]);
        },
      })),
    },
  ),
);
