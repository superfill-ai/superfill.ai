import { dataStorage } from "./data";
import { securityStorage } from "./security";
import { settingsStorage } from "./settings";

export const store = {
  theme: settingsStorage.theme,
  trigger: settingsStorage.trigger,
  aiSettings: settingsStorage.aiSettings,
  syncState: settingsStorage.syncState,

  memories: dataStorage.memories,
  formMappings: dataStorage.formMappings,
  fillSessions: dataStorage.fillSessions,

  apiKeys: securityStorage.apiKeys,
};

export { dataStorage } from "./data";
export { securityStorage } from "./security";
export { settingsStorage } from "./settings";
