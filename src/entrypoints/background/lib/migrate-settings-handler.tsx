import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { aiSettingsFallback } from "@/lib/storage/ai-settings";

const logger = createLogger("migrate-settings-handler");

export const migrateAISettings = async () => {
  const currentSettings = await storage.aiSettings.getValue();
  const needsMigration =
    currentSettings.contextMenuEnabled === undefined ||
    currentSettings.inlineTriggerEnabled === undefined;

  if (needsMigration) {
    const migratedSettings = {
      ...aiSettingsFallback,
      ...currentSettings,
    };
    await storage.aiSettings.setValue(migratedSettings);
    logger.info("AI settings migrated", {
      contextMenuEnabled: migratedSettings.contextMenuEnabled,
      inlineTriggerEnabled: migratedSettings.inlineTriggerEnabled,
    });
    return migratedSettings;
  }

  return currentSettings;
};
