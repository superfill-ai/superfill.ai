import { create } from "zustand";
import { createLogger } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import { keyVault } from "@/lib/security/key-vault";
import { storage } from "@/lib/storage";
import type { AISettings } from "@/types/settings";

const logger = createLogger("store:ai-settings");

type AISettingsState = {
  selectedProvider?: AIProvider;
  selectedModels: Partial<Record<AIProvider, string>>;
  autoFillEnabled: boolean;
  autopilotMode: boolean;
  confidenceThreshold: number;
  loading: boolean;
  error: string | null;
};

type AISettingsActions = {
  setSelectedProvider: (provider: AIProvider) => Promise<void>;
  setSelectedModel: (provider: AIProvider, model: string) => Promise<void>;
  setAutoFillEnabled: (enabled: boolean) => Promise<void>;
  setAutopilotMode: (enabled: boolean) => Promise<void>;
  setConfidenceThreshold: (threshold: number) => Promise<void>;
  setApiKey: (provider: AIProvider, key: string) => Promise<void>;
  getApiKey: (provider: AIProvider) => Promise<string | null>;
  deleteApiKey: (provider: AIProvider) => Promise<void>;
};

let unwatchAiSettings: (() => void) | undefined;

export const useAISettingsStore = create<AISettingsState & AISettingsActions>()(
  (set) => {
    storage.aiSettings.getValue().then((settings) => {
      set({
        selectedProvider: settings.selectedProvider,
        selectedModels: settings.selectedModels || {},
        autoFillEnabled: settings.autoFillEnabled,
        autopilotMode: settings.autopilotMode,
        confidenceThreshold: settings.confidenceThreshold,
      });
    });

    if (!unwatchAiSettings) {
      unwatchAiSettings = storage.aiSettings.watch((newSettings) => {
        if (newSettings !== null) {
          set({
            selectedProvider: newSettings.selectedProvider,
            selectedModels: newSettings.selectedModels || {},
            autoFillEnabled: newSettings.autoFillEnabled,
            autopilotMode: newSettings.autopilotMode,
            confidenceThreshold: newSettings.confidenceThreshold,
          });
        }
      });
    }

    return {
      selectedModels: {},
      autoFillEnabled: true,
      autopilotMode: false,
      confidenceThreshold: 0.6,
      loading: false,
      error: null,

      setSelectedProvider: async (provider: AIProvider) => {
        try {
          set({ loading: true, error: null });

          const currentSettings = await storage.aiSettings.getValue();
          const updatedSettings: AISettings = {
            ...currentSettings,
            selectedProvider: provider,
          };

          await storage.aiSettings.setValue(updatedSettings);
          set({ selectedProvider: provider, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set provider";
          logger.error("Failed to set provider:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setSelectedModel: async (provider: AIProvider, model: string) => {
        try {
          set({ loading: true, error: null });

          const currentSettings = await storage.aiSettings.getValue();
          const updatedModels = {
            ...currentSettings.selectedModels,
            [provider]: model,
          };
          const updatedSettings: AISettings = {
            ...currentSettings,
            selectedModels: updatedModels,
          };

          await storage.aiSettings.setValue(updatedSettings);
          set({ selectedModels: updatedModels, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set model";
          logger.error("Failed to set model:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setAutoFillEnabled: async (enabled: boolean) => {
        try {
          set({ loading: true, error: null });

          const currentSettings = await storage.aiSettings.getValue();
          const updatedSettings: AISettings = {
            ...currentSettings,
            autoFillEnabled: enabled,
          };

          await storage.aiSettings.setValue(updatedSettings);
          set({ autoFillEnabled: enabled, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set auto-fill";
          logger.error("Failed to set auto-fill:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setAutopilotMode: async (enabled: boolean) => {
        try {
          set({ loading: true, error: null });

          const currentSettings = await storage.aiSettings.getValue();
          const updatedSettings: AISettings = {
            ...currentSettings,
            autopilotMode: enabled,
          };

          await storage.aiSettings.setValue(updatedSettings);
          set({ autopilotMode: enabled, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to set autopilot mode";
          logger.error("Failed to set autopilot mode:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setConfidenceThreshold: async (threshold: number) => {
        try {
          set({ loading: true, error: null });

          const currentSettings = await storage.aiSettings.getValue();
          const updatedSettings: AISettings = {
            ...currentSettings,
            confidenceThreshold: threshold,
          };

          await storage.aiSettings.setValue(updatedSettings);
          set({ confidenceThreshold: threshold, loading: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to set confidence threshold";
          logger.error("Failed to set confidence threshold:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      setApiKey: async (provider, key) => {
        try {
          set({ loading: true, error: null });

          if (await keyVault.validateKey(provider, key)) {
            await keyVault.storeKey(provider, key);

            const currentSettings = await storage.aiSettings.getValue();
            const updatedSettings: AISettings = {
              ...currentSettings,
              selectedProvider: provider,
            };

            await storage.aiSettings.setValue(updatedSettings);
            set({ selectedProvider: provider, loading: false });
          } else {
            set({ loading: false, error: "Invalid API key" });
            throw new Error("Invalid API key");
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to set API key";
          logger.error("Failed to set API key:", error);
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
          logger.error("Failed to delete API key:", error);
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },
    };
  },
);

export const cleanupAISettingsWatchers = () => {
  unwatchAiSettings?.();
  unwatchAiSettings = undefined;
};

if (import.meta.hot) {
  import.meta.hot.dispose(cleanupAISettingsWatchers);
}
