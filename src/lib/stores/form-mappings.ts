import { create } from "zustand";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { FormMapping } from "@/types/memory";

type FormMappingsState = {
  formMappings: FormMapping[];
  loading: boolean;
  error: string | null;
};

type FormMappingsActions = {
  addFormMapping: (mapping: FormMapping) => Promise<void>;
  updateFormMapping: (
    url: string,
    updates: Partial<FormMapping>,
  ) => Promise<void>;
  deleteFormMapping: (url: string) => Promise<void>;
  getFormMappingByUrl: (url: string) => FormMapping | undefined;
};

const logger = createLogger("store:form-mappings");

let unwatchFormMappings: (() => void) | undefined;

export const useFormMappingsStore = create<
  FormMappingsState & FormMappingsActions
>()((set, get) => {
  storage.formMappings.getValue().then((formMappings) => {
    set({ formMappings });
  });

  if (!unwatchFormMappings) {
    unwatchFormMappings = storage.formMappings.watch((newMappings) => {
      if (newMappings !== null) {
        set({ formMappings: newMappings });
      }
    });
  }

  return {
    formMappings: [],
    loading: false,
    error: null,

    addFormMapping: async (mapping: FormMapping) => {
      try {
        set({ loading: true, error: null });

        const currentMappings = await storage.formMappings.getValue();
        const existingIndex = currentMappings.findIndex(
          (m) => m.url === mapping.url && m.formId === mapping.formId,
        );

        let updatedMappings: FormMapping[];
        if (existingIndex !== -1) {
          updatedMappings = currentMappings.map((m, i) =>
            i === existingIndex
              ? { ...mapping, timestamp: new Date().toISOString() }
              : m,
          );
        } else {
          updatedMappings = [
            ...currentMappings,
            { ...mapping, timestamp: new Date().toISOString() },
          ];
        }

        await storage.formMappings.setValue(updatedMappings);
        set({ formMappings: updatedMappings, loading: false });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to add form mapping";
        logger.error("Failed to add form mapping:", error);
        set({ loading: false, error: errorMessage });
        throw error;
      }
    },

    updateFormMapping: async (url: string, updates: Partial<FormMapping>) => {
      try {
        set({ loading: true, error: null });

        const currentMappings = await storage.formMappings.getValue();
        const mapping = currentMappings.find((m) => m.url === url);

        if (!mapping) {
          throw new Error(`Form mapping for URL ${url} not found`);
        }

        const updatedMapping: FormMapping = {
          ...mapping,
          ...updates,
          timestamp: new Date().toISOString(),
        };

        const updatedMappings = currentMappings.map((m) =>
          m.url === url ? updatedMapping : m,
        );

        await storage.formMappings.setValue(updatedMappings);
        set({ formMappings: updatedMappings, loading: false });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to update form mapping";
        logger.error("Failed to update form mapping:", error);
        set({ loading: false, error: errorMessage });
        throw error;
      }
    },

    deleteFormMapping: async (url: string) => {
      try {
        set({ loading: true, error: null });

        const currentMappings = await storage.formMappings.getValue();
        const updatedMappings = currentMappings.filter((m) => m.url !== url);

        await storage.formMappings.setValue(updatedMappings);
        set({ formMappings: updatedMappings, loading: false });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to delete form mapping";
        logger.error("Failed to delete form mapping:", error);
        set({ loading: false, error: errorMessage });
        throw error;
      }
    },

    getFormMappingByUrl: (url: string) => {
      return get().formMappings.find((m) => m.url === url);
    },
  };
});

export const cleanupFormMappingsWatchers = () => {
  unwatchFormMappings?.();
  unwatchFormMappings = undefined;
};

if (import.meta.hot) {
  import.meta.hot.dispose(cleanupFormMappingsWatchers);
}
