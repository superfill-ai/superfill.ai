import type { WebsiteContext } from "./context";

export type FormOpId = `__form__${string}` & {
  readonly __brand: unique symbol;
};
export type FieldOpId = `__${number}` & { readonly __brand: unique symbol };

export type DetectFormsResult =
  | {
      success: true;
      forms: DetectedFormSnapshot[];
      totalFields: number;
      websiteContext: WebsiteContext;
      frameInfo: FrameInfo;
    }
  | {
      success: false;
      forms: never[];
      totalFields: 0;
      error: string;
      frameInfo: FrameInfo;
    };

export interface FrameInfo {
  isMainFrame: boolean;
  frameUrl: string;
  parentUrl: string;
  frameDepth: number;
}

export interface DetectedForm {
  opid: FormOpId;
  element: HTMLFormElement | null;
  action: string;
  method: string;
  name: string;
  fields: DetectedField[];
}

export interface DetectedFormSnapshot
  extends Omit<DetectedForm, "element" | "fields"> {
  fields: DetectedFieldSnapshot[];
}

export interface DetectedField {
  opid: FieldOpId;
  element: FormFieldElement;
  metadata: FieldMetadata;
  formOpid: FormOpId;
}

export interface FieldMetadataSnapshot
  extends Omit<FieldMetadata, "rect" | "options"> {
  rect: DOMRectInit;
  options?: RadioOptionSnapshot[];
}

export interface DetectedFieldSnapshot
  extends Omit<DetectedField, "element" | "metadata"> {
  frameId?: number;
  metadata: FieldMetadataSnapshot;
}

export interface RadioOption {
  value: string;
  label: string | null;
  element: HTMLInputElement;
}

export interface RadioOptionSnapshot {
  value: string;
  label: string | null;
}

export interface FieldMetadata {
  id: string | null;
  name: string | null;
  className: string | null;
  type: string;

  labelTag: string | null;
  labelData: string | null;
  labelAria: string | null;
  labelLeft: string | null;
  labelTop: string | null;

  placeholder: string | null;
  helperText: string | null;
  autocomplete: string | null;

  required: boolean;
  disabled: boolean;
  readonly: boolean;
  maxLength: number | null;

  rect: DOMRect;

  currentValue: string;

  fieldType: FieldType;
  fieldPurpose: FieldPurpose;

  /** For radio/checkbox groups: list of available options */
  options?: RadioOption[];
}

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "number"
  | "password";

export type FieldPurpose =
  | "name"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "country"
  | "company"
  | "title"
  | "unknown";

export type FormFieldElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

export interface CompressedFieldData {
  opid: string;
  type: FieldType;
  purpose: FieldPurpose;
  labels: string[];
  context: string;
  options?: RadioOptionSnapshot[];
}

export interface CompressedMemoryData {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface FieldMapping {
  fieldOpid: string;
  value: string | null;
  confidence: number;
  reasoning: string;
  autoFill?: boolean;
}

export interface AutofillResult {
  success: boolean;
  mappings: FieldMapping[];
  error?: string;
  processingTime?: number;
}

export interface PreviewFieldData {
  fieldOpid: FieldOpId;
  formOpid: FormOpId;
  metadata: FieldMetadataSnapshot;
  mapping: FieldMapping;
  primaryLabel: string;
}

export interface PreviewSidebarPayload {
  forms: DetectedFormSnapshot[];
  mappings: FieldMapping[];
  processingTime?: number;
  sessionId: string;
}

export type AutofillProgressState =
  | "idle"
  | "detecting"
  | "analyzing"
  | "matching"
  | "showing-preview"
  | "filling"
  | "completed"
  | "failed";

export interface AutofillProgress {
  state: AutofillProgressState;
  message: string;
  fieldsDetected?: number;
  fieldsMatched?: number;
  error?: string;
}

export interface FilterStats {
  total: number;
  filtered: number;
  reasons: {
    noQuality: number;
    duplicate: number;
    unknownUnlabeled: number;
  };
}

export type FieldsToFillData = Array<{
  fieldOpid: FieldOpId;
  value: string;
}>;
