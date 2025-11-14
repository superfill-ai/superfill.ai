import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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

export const useAISettingsStore = create<AISettingsState & AISettingsActions>()(
  persist(
    (set, get) => ({
      selectedModels: {},
      autoFillEnabled: true,
      autopilotMode: false,
      confidenceThreshold: 0.6,
      loading: false,
      error: null,

      setSelectedProvider: async (provider: AIProvider) => {
        try {
          set({ loading: true, error: null });

          await storage.aiSettings.setValue({
            ...get(),
            selectedProvider: provider,
          });

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
          const updatedModels = { ...get().selectedModels, [provider]: model };
          await storage.aiSettings.setValue({
            ...get(),
            selectedModels: updatedModels,
          });
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
          await storage.aiSettings.setValue({
            ...get(),
            autoFillEnabled: enabled,
          });
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
          await storage.aiSettings.setValue({
            ...get(),
            autopilotMode: enabled,
          });
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
          await storage.aiSettings.setValue({
            ...get(),
            confidenceThreshold: threshold,
          });
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
    }),
    {
      name: "ai-settings-storage",
      storage: createJSONStorage(() => ({
        getItem: async () => {
          try {
            const aiSettings = await storage.aiSettings.getValue();

            return JSON.stringify({
              state: {
                ...aiSettings,
                loading: false,
                error: null,
              },
            });
          } catch (error) {
            logger.error("Failed to load AI settings:", error);
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

            const { state } = parsed as { state: AISettings };

            if (!state) {
              logger.warn("No state in parsed form data, skipping save");
              return;
            }

            await storage.aiSettings.setValue(state);
          } catch (error) {
            logger.error("Failed to save AI settings:", error);
          }
        },
        removeItem: async () => {
          await storage.aiSettings.setValue({
            selectedModels: {},
            autoFillEnabled: true,
            autopilotMode: false,
            confidenceThreshold: 0.6,
          });
        },
      })),
    },
  ),
);
