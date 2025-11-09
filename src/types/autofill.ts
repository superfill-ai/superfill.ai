export type FormOpId = `__form__${string}` & {
  readonly __brand: unique symbol;
};
export type FieldOpId = `__${number}` & { readonly __brand: unique symbol };

export type DetectFormsResult =
  | {
      success: true;
      forms: DetectedFormSnapshot[];
      totalFields: number;
    }
  | { success: false; forms: never[]; totalFields: 0; error: string };

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

export interface FieldMetadataSnapshot extends Omit<FieldMetadata, "rect"> {
  rect: DOMRectInit;
}

export interface DetectedFieldSnapshot
  extends Omit<DetectedField, "element" | "metadata"> {
  metadata: FieldMetadataSnapshot;
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
  labelRight: string | null;
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
}

export interface CompressedMemoryData {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface FieldMapping {
  fieldOpid: string;
  memoryId: string | null;
  value: string | null;
  confidence: number;
  reasoning: string;
  alternativeMatches: Array<{
    memoryId: string;
    value: string;
    confidence: number;
  }>;
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
