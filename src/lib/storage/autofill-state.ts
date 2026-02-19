import type { AutofillProgress, PreviewSidebarPayload } from "@/types/autofill";

export interface AutofillSidepanelState {
  mode: "loading" | "preview";
  progress?: AutofillProgress;
  payload?: PreviewSidebarPayload;
  tabId: number;
  tabUrl?: string;
  tabTitle?: string;
}

/** Keyed by tab ID so multiple tabs can be autofilled simultaneously. */
export const autofillSidepanelState = storage.defineItem<
  Record<number, AutofillSidepanelState>
>("local:autofill:sidepanel-state", { fallback: {} });
