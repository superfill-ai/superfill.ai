import { aiSettings } from "./ai-settings";
import { dataStorage } from "./data";
import { securityStorage } from "./security";
import { uiSettings } from "./ui-settings";

export const storage = {
  uiSettings,
  aiSettings,
  ...dataStorage,
  ...securityStorage,
};
