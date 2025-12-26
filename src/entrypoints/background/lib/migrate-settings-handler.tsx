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
      ...currentSettings,
      contextMenuEnabled:
        currentSettings.contextMenuEnabled ??
        aiSettingsFallback.contextMenuEnabled,
      inlineTriggerEnabled:
        currentSettings.inlineTriggerEnabled ??
        aiSettingsFallback.inlineTriggerEnabled,
    };
    await storage.aiSettings.setValue(migratedSettings);
    logger.debug("AI settings migrated", {
      contextMenuEnabled: migratedSettings.contextMenuEnabled,
      inlineTriggerEnabled: migratedSettings.inlineTriggerEnabled,
    });
    return migratedSettings;
  }

  return currentSettings;
};
