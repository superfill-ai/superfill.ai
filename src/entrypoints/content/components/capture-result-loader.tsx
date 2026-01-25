import { CheckCircle2Icon, HeartCrackIcon, InfoIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/cn";

type CaptureResultState = "saving" | "success" | "info" | "error";

type CaptureResultLoaderProps = {
  state: CaptureResultState;
  totalFields: number;
  savedCount: number;
  skippedCount: number;
  onClose: () => void;
};

const getStateConfig = (state: CaptureResultState) => {
  switch (state) {
    case "saving":
      return {
        title: "Saving memories...",
        description: "Processing your form data",
        progressValue: 50,
        icon: null,
        progressClass: "[&>div]:bg-primary",
      };
    case "success":
      return {
        title: "Memories saved successfully",
        description: "Your data is ready for future autofill",
        progressValue: 100,
        icon: <CheckCircle2Icon className="size-4 text-green-500 shrink-0" />,
        progressClass: "[&>div]:bg-green-500",
      };
    case "info":
      return {
        title: "No new memories saved",
        description: "All fields were duplicates",
        progressValue: 100,
        icon: <InfoIcon className="size-4 text-blue-500 shrink-0" />,
        progressClass: "[&>div]:bg-blue-500",
      };
    case "error":
      return {
        title: "Failed to save memories",
        description: "An error occurred, please try again",
        progressValue: 100,
        icon: <HeartCrackIcon className="size-4 text-destructive shrink-0" />,
        progressClass: "[&>div]:bg-destructive",
      };
  }
};

export const CaptureResultLoader = ({
  state,
  totalFields,
  savedCount,
  skippedCount,
  onClose,
}: CaptureResultLoaderProps) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (state === "success" || state === "info" || state === "error") {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [state, onClose]);

  const config = getStateConfig(state);

  return (
    <div
      className={cn(
        "fixed top-20 right-4 z-9999 transition-all duration-300 ease-out",
        isVisible
          ? "opacity-100 translate-x-0 scale-100 animate-slide-in-right"
          : "opacity-0 translate-x-4 scale-95 pointer-events-none",
      )}
      style={{ width: "400px", maxWidth: "calc(100vw - 32px)" }}
    >
      <Card className="w-full shadow-2xl border border-border/50 backdrop-blur-sm bg-background/95">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-3 w-full flex-1">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  {config.title} {config.icon}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-1">
                  {config.description}
                </CardDescription>
              </div>
              <Progress
                value={config.progressValue}
                className={cn("h-2 transition-colors", config.progressClass)}
              />
            </div>
          </div>
        </CardHeader>
        {(state === "success" || state === "info") && (
          <CardFooter>
            <div className="w-full flex flex-col gap-2">
              <Separator />
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {totalFields}
                    </span>{" "}
                    field{totalFields !== 1 ? "s" : ""} detected
                  </span>
                  {savedCount > 0 && (
                    <span className="text-muted-foreground">
                      <span className="font-medium text-green-600">
                        {savedCount}
                      </span>{" "}
                      saved
                    </span>
                  )}
                  {skippedCount > 0 && (
                    <span className="text-muted-foreground">
                      <span className="font-medium text-blue-600">
                        {skippedCount}
                      </span>{" "}
                      skipped
                    </span>
                  )}
                </div>
                {state === "success" && (
                  <span className="text-xs text-green-600 font-medium">
                    ✓ Complete
                  </span>
                )}
              </div>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
};
