import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { aiSettingsFallback } from "@/lib/storage/ai-settings";

const logger = createLogger("migrate-settings-handler");

export const migrateAISettings = async () => {
  try {
    const currentSettings = await storage.aiSettings.getValue();
    if (!currentSettings) {
      logger.warn("No current settings found, using fallback");
      await storage.aiSettings.setValue(aiSettingsFallback);
      return aiSettingsFallback;
    }
    const needsMigration =
      currentSettings.contextMenuEnabled === undefined ||
      currentSettings.inlineTriggerEnabled === undefined;

    if (needsMigration) {
      const migratedSettings = {
        ...currentSettings,
        contextMenuEnabled:
          currentSettings.contextMenuEnabled ??
          aiSettingsFallback.contextMenuEnabled,
        inlineTriggerEnabled:
          currentSettings.inlineTriggerEnabled ??
          aiSettingsFallback.inlineTriggerEnabled,
      };
      await storage.aiSettings.setValue(migratedSettings);
      logger.info("AI settings migrated", {
        contextMenuEnabled: migratedSettings.contextMenuEnabled,
        inlineTriggerEnabled: migratedSettings.inlineTriggerEnabled,
      });
      return migratedSettings;
    }

    return currentSettings;
  } catch (error) {
    logger.error("Failed to migrate AI settings", error);
    return aiSettingsFallback;
  }
};
