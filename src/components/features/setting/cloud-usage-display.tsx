import { Cloud, RefreshCwIcon, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useCloudUsage } from "@/hooks/use-cloud-usage";
import { cn } from "@/lib/cn";

export function CloudUsageDisplay() {
  const { isAuthenticated } = useAuth();
  const { data: usage, isLoading, isFetching, refetch } = useCloudUsage();

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return <Skeleton className="h-8 w-48" />;
  }

  if (!usage) {
    return null;
  }

  const isUnlimited = usage.limit === null || usage.limit === -1;
  const limit = usage.limit ?? 0;
  const remaining = usage.remaining ?? 0;
  const usagePercent =
    isUnlimited || limit === 0 ? 0 : (usage.used / limit) * 100;
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

  return (
    <Popover>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent side="bottom" className="max-w-xs">
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <p className="font-medium">Cloud AI Usage</p>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCwIcon
                className={cn(`size-4`, isFetching && "animate-spin")}
              />
            </Button>
          </div>
          {usage.plan === "free" && (
            <p className="text-xs text-foreground">
              Upgrade to Pro or Max for cloud AI access
            </p>
          )}
          {usage.plan !== "free" && isUnlimited && (
            <p className="text-xs text-foreground">
              {usage.used.toLocaleString()} operations this month • Unlimited
            </p>
          )}
          {usage.plan !== "free" && !isUnlimited && (
            <>
              <p className="text-xs text-foreground">
                {usage.used.toLocaleString()} / {limit.toLocaleString()}{" "}
                operations
              </p>
              <p className="text-xs text-foreground">
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
      </PopoverContent>
    </Popover>
  );
}
