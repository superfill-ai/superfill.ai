import { defineExtensionMessaging } from "@webext-core/messaging";
import type {
  AutofillProgress,
  DetectFormsResult,
  PreviewSidebarPayload,
} from "@/types/autofill";
import type { WebsiteContext } from "@/types/context";
import type { FillSession, FormMapping } from "@/types/memory";

interface ContentAutofillProtocolMap {
  detectForms: () => Promise<DetectFormsResult>;
  showPreview: (data: PreviewSidebarPayload) => boolean;
  closePreview: () => boolean;
  updateProgress: (progress: AutofillProgress) => boolean;

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
}

export const contentAutofillMessaging =
  defineExtensionMessaging<ContentAutofillProtocolMap>();
