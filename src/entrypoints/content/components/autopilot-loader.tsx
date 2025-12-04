import { HeartCrackIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/cn";
import { logger } from "@/lib/logger";
import type { AutofillProgress } from "@/types/autofill";
import {
  getProgressDescription,
  getProgressIcon,
  getProgressTitle,
  getProgressValue,
} from "../lib/progress-utils";
import { MemoryLoader } from "./memory-loader";

type AutopilotLoaderProps = {
  progress: AutofillProgress;
  onClose: () => void;
};

export const AutopilotLoader = ({
  progress,
  onClose,
}: AutopilotLoaderProps) => {
  const [isVisible, setIsVisible] = useState(true);

  logger.info("Rendering AutopilotLoader with progress:", progress);

  useEffect(() => {
    if (progress.state === "completed" || progress.state === "failed") {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [progress.state, onClose]);

  const progressValue = getProgressValue(progress.state);
  const progressIcon = getProgressIcon(progress.state);
  const isError = progressIcon === "error";
  const isComplete = progressIcon === "success";

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-9999 transition-all duration-300 ease-out",
        isVisible
          ? "opacity-100 translate-x-0 scale-100 animate-slide-in-right"
          : "opacity-0 translate-x-4 scale-95 pointer-events-none",
      )}
      style={{ width: "500px", maxWidth: "calc(100vw - 32px)" }}
    >
      <Card className="w-full shadow-2xl border border-border/50 backdrop-blur-sm bg-background/95">
        <CardHeader>
          <div className="flex items-start justify-between gap-5">
            <div className="flex items-start gap-2 w-full flex-col flex-1">
              <div className="flex flex-col gap-5 w-full">
                <div>
                  <CardTitle className="text-base font-semibold truncate flex items-center gap-2">
                    {getProgressTitle(progress.state, "autopilot")}{" "}
                    {isError ? (
                      <HeartCrackIcon className="size-4 text-destructive shrink-0" />
                    ) : isComplete ? (
                      <SparklesIcon className="size-4 text-green-500 shrink-0" />
                    ) : null}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Autopilot mode active
                  </CardDescription>
                </div>
                <div className="space-y-2">
                  <Progress
                    value={progressValue}
                    className={cn(
                      "h-2 transition-colors",
                      isError
                        ? "[&>div]:bg-destructive"
                        : isComplete
                          ? "[&>div]:bg-green-500"
                          : "[&>div]:bg-primary",
                    )}
                  />

                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {getProgressDescription(progress, "autopilot")}
                  </p>
                </div>
              </div>
            </div>
            <CardAction>
              <MemoryLoader />
            </CardAction>
          </div>
        </CardHeader>
        <CardFooter>
          {(progress.fieldsDetected ||
            progress.fieldsMatched !== undefined) && (
            <div className="w-full flex flex-col gap-2">
              <Separator />
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  {progress.fieldsDetected && (
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {progress.fieldsDetected}
                      </span>{" "}
                      fields detected
                    </span>
                  )}
                  {progress.fieldsMatched !== undefined && (
                    <span className="text-muted-foreground">
                      <span className="font-medium text-green-600">
                        {progress.fieldsMatched}
                      </span>{" "}
                      matches found
                    </span>
                  )}
                </div>

                {isComplete && (
                  <span className="text-xs text-green-600 font-medium">
                    ✓ Complete
                  </span>
                )}

                {isError && (
                  <span className="text-xs text-destructive font-medium">
                    ✗ Failed
                  </span>
                )}
              </div>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};
