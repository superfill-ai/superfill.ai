import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  CLOUD_USAGE_CACHE_TTL,
  CLOUD_USAGE_GC_TIME,
  getCloudUsageStatus,
} from "@/lib/ai/cloud-client";
import { storage } from "@/lib/storage";
import type { UsageStatus } from "@/types/cloud";

export const CLOUD_USAGE_QUERY_KEY = ["cloud-usage"] as const;

export function useCloudUsage() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: CLOUD_USAGE_QUERY_KEY,
    queryFn: async () => {
      if (!isAuthenticated) return null;
      return getCloudUsageStatus(true);
    },
    enabled: isAuthenticated,
    staleTime: CLOUD_USAGE_CACHE_TTL,
    gcTime: CLOUD_USAGE_GC_TIME,
  });

  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = storage.aiSettings.watch((newSettings) => {
      if (!newSettings?.cloudModelsEnabled) {
        queryClient.invalidateQueries({ queryKey: CLOUD_USAGE_QUERY_KEY });
      }
    });

    return () => unsubscribe();
  }, [isAuthenticated, queryClient]);

  return query;
}

export function useCloudUsageStatus(): UsageStatus | null {
  const { data } = useCloudUsage();
  return data ?? null;
}
