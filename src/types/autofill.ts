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
    }
  | { success: false; forms: never[]; totalFields: 0; error: string };

export interface DetectedForm {
  opid: FormOpId;
  element: HTMLFormElement | null;
  action: string;
  method: string;
  name: string;
  fields: DetectedField[];
  /** Serialized DOM context for AI matching */
  domContext?: string;
}

export interface DetectedFormSnapshot
  extends Omit<DetectedForm, "element" | "fields"> {
  fields: DetectedFieldSnapshot[];
  /** Serialized DOM context for AI matching */
  domContext?: string;
}

export interface DetectedField {
  opid: FieldOpId;
  /** CSS selector for querying this field */
  selector: string;
  element: FormFieldElement;
  metadata: FieldMetadata;
  formOpid: FormOpId;
}

export interface FieldMetadataSnapshot extends Omit<FieldMetadata, "rect"> {
  rect: DOMRectInit;
}

export interface DetectedFieldSnapshot
  extends Omit<DetectedField, "element" | "metadata"> {
  /** CSS selector for querying this field */
  selector: string;
  metadata: FieldMetadataSnapshot;
}

export interface SelectOption {
  value: string;
  label: string;
  selected?: boolean;
}

export interface RadioGroupInfo {
  name: string;
  options: Array<{ value: string; label: string; checked: boolean }>;
}

export interface FieldMetadata {
  id: string | null;
  name: string | null;
  className: string | null;
  type: string;

  // Primary label sources (simplified)
  labelTag: string | null;
  labelAria: string | null;

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

  // Select/Radio/Checkbox specific
  options?: SelectOption[];
  radioGroup?: RadioGroupInfo;
  isChecked?: boolean;
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
  /** CSS selector for the field */
  selector: string;
  type: FieldType;
  purpose: FieldPurpose;
  label: string | null;
  context: string;
  // For select/radio/checkbox fields
  options?: string[];
  radioGroup?: { name: string; values: string[] };
  isChecked?: boolean;
}

export interface CompressedMemoryData {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface FieldMapping {
  /** CSS selector for the field */
  selector: string;
  /** @deprecated Use selector instead. Kept for backward compatibility */
  fieldOpid?: string;
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
  /** CSS selector for the field (primary identifier for storage) */
  selector: string;
  /** Runtime field identifier (used for live DOM operations) */
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
