import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { FormMapping } from "@/types/memory";

const logger = createLogger("form-mappings");

export const addFormMapping = async (mapping: FormMapping): Promise<void> => {
  try {
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
  } catch (error) {
    logger.error("Failed to add form mapping:", error);
    throw error;
  }
};

export const updateFormMapping = async (
  url: string,
  updates: Partial<FormMapping>,
): Promise<void> => {
  try {
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
  } catch (error) {
    logger.error("Failed to update form mapping:", error);
    throw error;
  }
};

export const deleteFormMapping = async (url: string): Promise<void> => {
  try {
    const currentMappings = await storage.formMappings.getValue();
    const updatedMappings = currentMappings.filter((m) => m.url !== url);

    await storage.formMappings.setValue(updatedMappings);
  } catch (error) {
    logger.error("Failed to delete form mapping:", error);
    throw error;
  }
};

export const getFormMappingByUrl = async (
  url: string,
): Promise<FormMapping | undefined> => {
  const mappings = await storage.formMappings.getValue();
  return mappings.find((m) => m.url === url);
};
