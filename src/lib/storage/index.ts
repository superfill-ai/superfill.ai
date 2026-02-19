import { aiSettings } from "./ai-settings";
import { autofillSidepanelState } from "./autofill-state";
import { captureSidepanelState } from "./capture-state";
import { dataStorage } from "./data";
import { securityStorage } from "./security";
import { uiSettings } from "./ui-settings";

export const storage = {
  uiSettings,
  aiSettings,
  autofillSidepanelState,
  captureSidepanelState,
  ...dataStorage,
  ...securityStorage,
};
