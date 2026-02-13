export type CloudOperationType =
  | "match"
  | "categorize"
  | "rephrase"
  | "bulk_categorize"
  | "deduplicate"
  | "parse_document";

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

export type {
  AnalysisResult,
  BulkCategorizationResult,
  Category,
  DeduplicationOperation,
  DeduplicationResult,
  ExtractedInfo,
  ExtractedItem,
  RephraseResult,
} from "@/lib/ai/schemas";
