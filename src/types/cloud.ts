export type CloudOperationType =
  | "match"
  | "categorize"
  | "rephrase"
  | "bulk_categorize"
  | "deduplicate"
  | "parse_document";

export type Category =
  | "contact"
  | "location"
  | "personal"
  | "work"
  | "education"
  | "general";

export interface AnalysisResult {
  category: Category;
  tags: string[];
  confidence: number;
  reasoning?: string;
}

export interface RephraseResult {
  rephrasedQuestion: string;
  rephrasedAnswer: string;
}

export interface BulkCategorizationResult {
  categories: Array<{
    index: number;
    category: Category;
    confidence: number;
  }>;
}

export interface DeduplicationOperation {
  action: "create" | "update" | "skip";
  fieldIndex: number;
  existingMemoryId?: string;
  newAnswer?: string;
  category?: Category;
  tags?: string[];
  confidence?: number;
  reasoning?: string;
}

export interface DeduplicationResult {
  operations: DeduplicationOperation[];
}

export interface ExtractedItem {
  label: string;
  question: string;
  answer: string;
  category: Category;
  tags: string[];
}

export interface ExtractedInfo {
  items: ExtractedItem[];
}

export interface UsageStatus {
  plan: "free" | "pro" | "max";
  used: number;
  limit: number | null;
  remaining: number | null;
  periodStart: string;
  periodEnd: string;
  resetAt: string;
  breakdown: {
    match: number;
    categorize: number;
    rephrase: number;
    bulk_categorize: number;
    deduplicate: number;
    parse_document: number;
  };
}

export interface QuotaExceededResponse {
  error: "quota_exceeded";
  message: string;
  fallbackToLocal: boolean;
  used: number;
  limit: number;
  resetAt: string;
}

export interface CloudAIResponse<T> {
  success: true;
  data: T;
  remaining?: number;
}

export interface CloudAIError {
  success: false;
  error: string;
  fallbackToLocal: boolean;
  quotaExceeded?: boolean;
  used?: number;
  limit?: number;
  resetAt?: string;
}

export type CloudAIResult<T> = CloudAIResponse<T> | CloudAIError;
