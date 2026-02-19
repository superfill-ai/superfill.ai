import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { AutofillSidepanelState } from "@/lib/storage/autofill-state";
import type {
  AutofillProgress,
  DetectedField,
  DetectedForm,
  FieldOpId,
  FormOpId,
  PreviewSidebarPayload,
} from "@/types/autofill";

const logger = createLogger("preview-manager");

type PreviewSidebarManagerOptions = {
  ctx: ContentScriptContext;
  tabId: number;
  getFieldMetadata: (fieldOpid: FieldOpId) => DetectedField | null;
  getFormMetadata: (formOpid: FormOpId) => DetectedForm | null;
};

type PreviewShowParams = {
  payload: PreviewSidebarPayload;
};

/**
 * Manages the autofill preview by writing state to storage so the side panel
 * can display it. No shadow DOM overlay is used — the side panel is
 * the single source of UI for the preview.
 */
export class PreviewSidebarManager {
  private readonly options: PreviewSidebarManagerOptions;

  constructor(options: PreviewSidebarManagerOptions) {
    this.options = options;
  }

  private async updateState(
    patch: Omit<AutofillSidepanelState, "tabId" | "tabUrl" | "tabTitle">,
  ) {
    const tabId = this.options.tabId;
    try {
      const current = await storage.autofillSidepanelState.getValue();
      await storage.autofillSidepanelState.setValue({
        ...current,
        [tabId]: {
          ...patch,
          tabId,
          tabUrl: window.location.href,
          tabTitle: document.title,
        },
      });
    } catch (error) {
      logger.error("Failed to write state to storage:", error);
    }
  }

  async show({ payload }: PreviewShowParams) {
    logger.info("Writing preview payload to storage for side panel");
    await this.updateState({ mode: "preview", payload });
  }

  async showProgress(progress: AutofillProgress) {
    logger.info("Writing progress state to storage for side panel", progress);
    await this.updateState({ mode: "loading", progress });
  }

  destroy() {
    const tabId = this.options.tabId;
    logger.info(`Clearing autofill state for tab ${tabId}`);
    storage.autofillSidepanelState
      .getValue()
      .then((current) => {
        const { [tabId]: _removed, ...rest } = current;
        return storage.autofillSidepanelState.setValue(
          rest as Record<number, AutofillSidepanelState>,
        );
      })
      .catch((err: unknown) => {
        logger.error("Failed to clear autofill state from storage:", err);
      });
  }
}
