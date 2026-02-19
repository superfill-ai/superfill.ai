import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { CaptureSidepanelState } from "@/lib/storage/capture-state";
import type { CapturedFieldData } from "@/types/autofill";

const logger = createLogger("capture-memory-manager");

/**
 * Manages the capture memory prompt by writing state to storage so the side
 * panel can display it. No shadow DOM overlay is used.
 */
export class CaptureMemoryManager {
  private tabId: number | null = null;

  async show(
    _ctx: ContentScriptContext,
    capturedFields: CapturedFieldData[],
    tabId: number,
  ): Promise<void> {
    this.tabId = tabId;
    logger.info(`Writing capture state to storage for tab ${tabId}`);
    try {
      const current = await storage.captureSidepanelState.getValue();
      await storage.captureSidepanelState.setValue({
        ...current,
        [tabId]: {
          tabId,
          tabUrl: window.location.href,
          tabTitle: document.title,
          capturedFields,
          resultState: null,
          savedCount: 0,
          skippedCount: 0,
        } satisfies CaptureSidepanelState,
      });
    } catch (error) {
      logger.error("Failed to write capture state to storage:", error);
    }
  }

  async hide(): Promise<void> {
    const tabId = this.tabId;
    if (!tabId) return;
    logger.info(`Clearing capture state for tab ${tabId}`);
    try {
      const current = await storage.captureSidepanelState.getValue();
      const { [tabId]: _removed, ...rest } = current;
      await storage.captureSidepanelState.setValue(
        rest as Record<number, CaptureSidepanelState>,
      );
    } catch (error) {
      logger.error("Failed to clear capture state from storage:", error);
    }
  }
}
