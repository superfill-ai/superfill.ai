import { defineExtensionMessaging } from "@webext-core/messaging";
import type { ToastType } from "@/components/ui/sonner";
import type {
  AutofillProgress,
  CapturedFieldData,
  DetectFormsResult,
  FieldsToFillData,
  PreviewSidebarPayload,
} from "@/types/autofill";
import type { FillSession, FormMapping } from "@/types/memory";

export interface ShowToastData {
  message: string;
  type?: ToastType;
  duration?: number;
  action?: {
    label: string;
    url: string;
  };
}

interface ContentAutofillProtocolMap {
  detectForms: () => Promise<DetectFormsResult>;
  collectAllFrameForms: (data: { requestId: string }) => void;
  fillFields: (data: { fieldsToFill: FieldsToFillData }) => void;
  showPreview: (data: PreviewSidebarPayload) => boolean;
  closePreview: () => boolean;
  updateProgress: (progress: AutofillProgress) => boolean;
  broadcastFillToAllFrames: (data: { fieldsToFill: FieldsToFillData }) => void;
  frameFormsDetected: (data: {
    requestId: string;
    result: DetectFormsResult;
  }) => void;

  startSession: () => FillSession;
  updateSessionStatus: (data: {
    sessionId: string;
    status: FillSession["status"];
  }) => boolean;
  completeSession: (data: { sessionId: string }) => boolean;
  incrementMemoryUsage: (data: { memoryIds: string[] }) => boolean;
  saveFormMappings: (data: {
    sessionId: string;
    formMappings: FormMapping[];
  }) => boolean;

  saveCapturedMemories: (data: {
    capturedFields: CapturedFieldData[];
  }) => Promise<{ success: boolean; savedCount: number }>;

  showToast: (data: ShowToastData) => boolean;
}

export const contentAutofillMessaging =
  defineExtensionMessaging<ContentAutofillProtocolMap>();
