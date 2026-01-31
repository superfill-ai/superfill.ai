import type { z } from "zod";
import { getAuthService } from "@/lib/auth/auth-service";
import { createLogger } from "@/lib/logger";
import type {
  AnalysisResult,
  BulkCategorizationResult,
  CloudAIResult,
  DeduplicationResult,
  ExtractedInfo,
  RephraseResult,
  UsageStatus,
} from "@/types/cloud";
import {
  AnalysisResultSchema,
  BulkCategorizationResultSchema,
  DeduplicationResultSchema,
  ExtractedInfoSchema,
  RephraseResultSchema,
  UsageStatusSchema,
} from "./schemas";

const logger = createLogger("cloud-client");

const API_URL = import.meta.env.WXT_WEBSITE_URL || "https://superfill.ai";
const CACHE_TTL = 5 * 60 * 1000;

let cachedUsageStatus: { data: UsageStatus; timestamp: number } | null = null;

async function getAuthToken(): Promise<string | null> {
  try {
    const authService = getAuthService();
    const session = await authService.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function cloudRequest<T>(
  endpoint: string,
  body: unknown,
  schema: z.ZodSchema<T>,
): Promise<CloudAIResult<T>> {
  const token = await getAuthToken();

  if (!token) {
    return {
      success: false,
      error: "Not authenticated",
      fallbackToLocal: true,
    };
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      return {
        success: false,
        error: "Authentication expired",
        fallbackToLocal: true,
      };
    }

    if (response.status === 403) {
      return {
        success: false,
        error: "Cloud AI requires a Pro or Max subscription",
        fallbackToLocal: true,
      };
    }

    if (response.status === 429) {
      const errorData = await response.json();
      cachedUsageStatus = null;

      return {
        success: false,
        error: errorData.message || "Quota exceeded",
        fallbackToLocal: true,
        quotaExceeded: true,
        used: errorData.used,
        limit: errorData.limit,
        resetAt: errorData.resetAt,
      };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `Request failed: ${response.status}`,
        fallbackToLocal: true,
      };
    }

    const data = await response.json();
    const parsed = schema.safeParse(data);

    if (!parsed.success) {
      logger.error("Invalid response schema:", parsed.error);
      return {
        success: false,
        error: "Invalid response from server",
        fallbackToLocal: true,
      };
    }

    const remaining = response.headers.get("X-Cloud-Usage-Remaining");

    return {
      success: true,
      data: parsed.data,
      remaining: remaining ? Number.parseInt(remaining, 10) : undefined,
    };
  } catch (error) {
    logger.error("Cloud request failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
      fallbackToLocal: true,
    };
  }
}

export async function cloudCategorize(
  answer: string,
  question?: string,
): Promise<CloudAIResult<AnalysisResult>> {
  return cloudRequest(
    "/routes/api/ai/categorize",
    { answer, question },
    AnalysisResultSchema,
  );
}

export async function cloudRephrase(
  answer: string,
  question?: string,
): Promise<CloudAIResult<RephraseResult>> {
  return cloudRequest(
    "/routes/api/ai/rephrase",
    { answer, question },
    RephraseResultSchema,
  );
}

export async function cloudBulkCategorize(
  fields: Array<{ question: string; answer: string }>,
): Promise<CloudAIResult<BulkCategorizationResult>> {
  return cloudRequest(
    "/routes/api/ai/bulk-categorize",
    { fields },
    BulkCategorizationResultSchema,
  );
}

export async function cloudDeduplicate(
  newFields: Array<{
    index: number;
    question: string;
    answer: string;
    fieldPurpose?: string;
  }>,
  existingMemories: Array<{
    id: string;
    question: string;
    answer: string;
    category: string;
    metadata?: Record<string, unknown>;
  }>,
): Promise<CloudAIResult<DeduplicationResult>> {
  return cloudRequest(
    "/routes/api/ai/deduplicate",
    { newFields, existingMemories },
    DeduplicationResultSchema,
  );
}

export async function cloudParseDocument(
  text: string,
  documentType?: "resume" | "generic",
): Promise<CloudAIResult<ExtractedInfo>> {
  return cloudRequest(
    "/routes/api/ai/parse-document",
    { text, documentType },
    ExtractedInfoSchema,
  );
}

export async function getCloudUsageStatus(
  forceRefresh = false,
): Promise<UsageStatus | null> {
  if (
    !forceRefresh &&
    cachedUsageStatus &&
    Date.now() - cachedUsageStatus.timestamp < CACHE_TTL
  ) {
    return cachedUsageStatus.data;
  }

  const token = await getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_URL}/routes/api/usage/status`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const parsed = UsageStatusSchema.safeParse(data);

    if (!parsed.success) {
      logger.error("Invalid usage status schema:", parsed.error);
      return null;
    }

    cachedUsageStatus = { data: parsed.data, timestamp: Date.now() };
    return parsed.data;
  } catch (error) {
    logger.error("Failed to get usage status:", error);
    return null;
  }
}

export async function shouldUseCloudAI(): Promise<boolean> {
  const authService = getAuthService();
  const session = await authService.getSession();
  if (!session) return false;

  const status = await getCloudUsageStatus();
  if (!status) return false;

  if (status.plan === "free") return false;
  if (status.plan === "max") return true;

  return status.remaining !== null && status.remaining > 0;
}

export function invalidateUsageCache(): void {
  cachedUsageStatus = null;
}
