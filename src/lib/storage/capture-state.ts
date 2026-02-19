import type { CapturedFieldData } from "@/types/autofill";

export type CaptureResultState = "saving" | "success" | "info" | "error";

export interface CaptureSidepanelState {
  tabId: number;
  tabUrl: string;
  tabTitle: string;
  capturedFields: CapturedFieldData[];
  resultState: CaptureResultState | null;
  savedCount: number;
  skippedCount: number;
}

/** Keyed by tab ID so multiple tabs can have a pending capture prompt simultaneously. */
export const captureSidepanelState = storage.defineItem<
  Record<number, CaptureSidepanelState>
>("local:capture:sidepanel-state", { fallback: {} });
