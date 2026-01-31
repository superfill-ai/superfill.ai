import { Cloud, RefreshCw, Sparkles, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import {
  getCloudUsageStatus,
  invalidateUsageCache,
} from "@/lib/ai/cloud-client";
import type { UsageStatus } from "@/types/cloud";

interface CloudUsageDisplayProps {
  compact?: boolean;
}

export function CloudUsageDisplay({ compact = false }: CloudUsageDisplayProps) {
  const { isAuthenticated } = useAuth();
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsage = useCallback(
    async (forceRefresh = false) => {
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }

      if (forceRefresh) {
        invalidateUsageCache();
        setRefreshing(true);
      }

      try {
        const status = await getCloudUsageStatus(forceRefresh);
        setUsage(status);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    if (compact) {
      return <Skeleton className="h-8 w-48" />;
    }

    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!usage) {
    return null;
  }

  const isUnlimited = usage.limit === null || usage.limit === -1;
  const limit = usage.limit ?? 0;
  const remaining = usage.remaining ?? 0;
  const usagePercent = isUnlimited ? 0 : (usage.used / limit) * 100;
  const isNearLimit = !isUnlimited && usagePercent >= 80;
  const isAtLimit = !isUnlimited && remaining === 0;

  const planBadge = {
    free: { label: "Free", variant: "secondary" as const, icon: null },
    pro: { label: "Pro", variant: "default" as const, icon: Sparkles },
    max: { label: "Max", variant: "default" as const, icon: Zap },
  }[usage.plan];

  const formatResetDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-card hover:bg-accent transition-colors cursor-default">
            <Cloud className="size-3.5 text-muted-foreground" />
            <Badge
              variant={planBadge.variant}
              className="gap-1 h-5 px-1.5 text-xs"
            >
              {planBadge.icon && <planBadge.icon className="size-3" />}
              {planBadge.label}
            </Badge>
            {usage.plan !== "free" && !isUnlimited && (
              <>
                <div className="h-1.5 w-20 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${isAtLimit ? "bg-destructive" : isNearLimit ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {remaining.toLocaleString()}
                </span>
              </>
            )}
            {usage.plan !== "free" && isUnlimited && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {usage.used.toLocaleString()}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5">
            <p className="font-medium">Cloud AI Usage</p>
            <Separator />
            {usage.plan === "free" && (
              <p className="text-xs text-muted">
                Upgrade to Pro or Max for cloud AI access
              </p>
            )}
            {usage.plan !== "free" && isUnlimited && (
              <p className="text-xs text-muted">
                {usage.used.toLocaleString()} operations this month • Unlimited
              </p>
            )}
            {usage.plan !== "free" && !isUnlimited && (
              <>
                <p className="text-xs text-muted">
                  {usage.used.toLocaleString()} / {limit.toLocaleString()}{" "}
                  operations
                </p>
                <p className="text-xs text-muted">
                  Resets on {formatResetDate(usage.resetAt)}
                </p>
                {isAtLimit && (
                  <p className="text-xs text-destructive">
                    Limit reached. Using local AI.
                  </p>
                )}
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="size-4" />
            Cloud AI Usage
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => fetchUsage(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
            <Badge variant={planBadge.variant} className="gap-1">
              {planBadge.icon && <planBadge.icon className="size-3" />}
              {planBadge.label}
            </Badge>
          </div>
        </div>
        <CardDescription>
          {usage.plan === "free"
            ? "Upgrade to Pro or Max for cloud AI access"
            : isUnlimited
              ? "Unlimited cloud AI operations"
              : `Resets on ${formatResetDate(usage.resetAt)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {usage.plan !== "free" && !isUnlimited && (
          <>
            <Progress
              value={usagePercent}
              className={`h-2 ${isAtLimit ? "[&>div]:bg-destructive" : isNearLimit ? "[&>div]:bg-amber-500" : ""}`}
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {usage.used.toLocaleString()} / {limit.toLocaleString()}{" "}
                operations
              </span>
              <span
                className={
                  isAtLimit
                    ? "text-destructive font-medium"
                    : isNearLimit
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                }
              >
                {remaining.toLocaleString()} remaining
              </span>
            </div>
            {isAtLimit && (
              <p className="text-sm text-destructive">
                You've reached your cloud AI limit. Operations will use your
                local AI model.
              </p>
            )}
          </>
        )}
        {usage.plan !== "free" && isUnlimited && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="size-4 text-primary" />
            {usage.used.toLocaleString()} operations this month
          </div>
        )}
        {usage.plan === "free" && (
          <div className="text-sm text-muted-foreground">
            <a
              href={`${import.meta.env.WXT_WEBSITE_URL || "https://superfill.ai"}/subscribe?source=extension`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Upgrade now
            </a>{" "}
            to get access to 1000+ cloud AI operations per month.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
