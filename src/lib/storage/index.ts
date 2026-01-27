import { aiSettings } from "./ai-settings";
import { dataStorage } from "./data";
import { apiKeys } from "./security";
import { syncStateAndSettings } from "./sync";
import { uiSettings } from "./ui-settings";

export const storage = {
  uiSettings,
  aiSettings,
  syncStateAndSettings,
  ...dataStorage,
  apiKeys,
};
