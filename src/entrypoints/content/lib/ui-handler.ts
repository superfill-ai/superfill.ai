import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type {
  AutofillProgress,
  DetectedField,
  DetectedForm,
  FieldOpId,
  FormOpId,
  PreviewSidebarPayload,
} from "@/types/autofill";
import { AutopilotManager } from "../components/autopilot-manager";
import { PreviewSidebarManager } from "../components/preview-manager";

const logger = createLogger("ui-handler");

let previewManager: PreviewSidebarManager | null = null;
let autopilotManager: AutopilotManager | null = null;

const ensurePreviewManager = (
  ctx: ContentScriptContext,
  getFieldMetadata: (fieldOpid: FieldOpId) => DetectedField | null,
  getFormMetadata: (formOpid: FormOpId) => DetectedForm | null,
) => {
  if (!previewManager) {
    previewManager = new PreviewSidebarManager({
      ctx,
      getFieldMetadata,
      getFormMetadata,
    });
  }

  return previewManager;
};

const ensureAutopilotManager = (
  ctx: ContentScriptContext,
  getFieldMetadata: (fieldOpid: FieldOpId) => DetectedField | null,
  getFormMetadata: (formOpid: FormOpId) => DetectedForm | null,
) => {
  if (!autopilotManager) {
    autopilotManager = new AutopilotManager({
      ctx,
      getFieldMetadata,
      getFormMetadata,
    });
  }

  return autopilotManager;
};

export const handleUpdateProgress = async (
  progress: AutofillProgress,
  ctx: ContentScriptContext,
  getFieldMetadata: (fieldOpid: FieldOpId) => DetectedField | null,
  getFormMetadata: (formOpid: FormOpId) => DetectedForm | null,
): Promise<boolean> => {
  try {
    const settingStore = await storage.aiSettings.getValue();

    if (settingStore.autopilotMode) {
      if (
        progress.state === "showing-preview" ||
        progress.state === "completed"
      ) {
        return true;
      }
      const manager = ensureAutopilotManager(
        ctx,
        getFieldMetadata,
        getFormMetadata,
      );
      await manager.showProgress(progress);
      return true;
    } else {
      const manager = ensurePreviewManager(
        ctx,
        getFieldMetadata,
        getFormMetadata,
      );
      await manager.showProgress(progress);
      return true;
    }
  } catch (error) {
    logger.error("Error updating progress:", error);
    return false;
  }
};

export const handleShowPreview = async (
  data: PreviewSidebarPayload,
  ctx: ContentScriptContext,
  getFieldMetadata: (fieldOpid: FieldOpId) => DetectedField | null,
  getFormMetadata: (formOpid: FormOpId) => DetectedForm | null,
): Promise<boolean> => {
  logger.debug("Received preview payload from background", {
    mappings: data.mappings.length,
    forms: data.forms.length,
  });

  logger.debug("Full payload structure:", {
    payload: data,
  });

  const settingStore = await storage.aiSettings.getValue();
  let manager: PreviewSidebarManager | AutopilotManager;

  if (settingStore.autopilotMode) {
    manager = ensureAutopilotManager(ctx, getFieldMetadata, getFormMetadata);
  } else {
    manager = ensurePreviewManager(ctx, getFieldMetadata, getFormMetadata);
  }

  try {
    if (settingStore.autopilotMode && manager instanceof AutopilotManager) {
      logger.debug("Autopilot manager created, attempting to show...");

      await manager.processAutofillData(
        data.mappings,
        settingStore.confidenceThreshold,
        data.sessionId,
      );

      logger.debug("Autopilot manager processed data successfully");
    } else if (manager instanceof PreviewSidebarManager) {
      logger.debug("Preview manager created, attempting to show...");

      await manager.show({
        payload: data,
      });

      logger.debug("Preview shown successfully");
    }
    return true;
  } catch (error) {
    logger.error("Error showing preview:", {
      error,
      errorMessage: error instanceof Error ? error.message : "Unknown",
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    await manager.showProgress({
      state: "failed",
      message: "Auto-fill failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
};

export const destroyUIManagers = () => {
  if (previewManager) {
    previewManager.destroy();
    previewManager = null;
  }

  if (autopilotManager) {
    autopilotManager.hide();
    autopilotManager = null;
  }
};
