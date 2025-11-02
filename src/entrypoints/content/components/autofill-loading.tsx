import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { AutofillProgress } from "@/types/autofill";
import { HeartCrackIcon, XIcon } from "lucide-react";
import { MemoryLoader } from "./memory-loader";

type AutofillLoadingProps = {
  progress: AutofillProgress;
  onClose: () => void;
};

const getProgressTitle = (state: AutofillProgress["state"]): string => {
  switch (state) {
    case "detecting":
      return "Detecting forms";
    case "analyzing":
      return "Analyzing fields";
    case "matching":
      return "Matching memories";
    case "showing-preview":
      return "Preparing suggestions";
    default:
      return "Processing";
  }
};

const getProgressDescription = (progress: AutofillProgress): string => {
  if (progress.fieldsDetected) {
    if (progress.fieldsMatched !== undefined) {
      return `Found ${progress.fieldsMatched} matches for ${progress.fieldsDetected} fields`;
    }
    return `Analyzing ${progress.fieldsDetected} fields`;
  }
  return progress.message;
};

export const AutofillLoading = ({
  progress,
  onClose,
}: AutofillLoadingProps) => {
  return (
    <div className="pointer-events-auto flex h-full w-full flex-col bg-background text-foreground border-l border-border shadow-lg">
      <Card className="flex h-full flex-col rounded-none border-0 shadow-none p-0 gap-0">
        <CardHeader className="border-b bg-background/95 px-5 py-4 flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              {progress.state === "failed" ? (
                <HeartCrackIcon className="size-4" />
              ) : (
                <Spinner className="size-4" />
              )}
              {getProgressTitle(progress.state)}
            </CardTitle>
            <CardDescription className="text-xs">
              Please do not navigate away from this page.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon />
          </Button>
        </CardHeader>

        <div className="flex-1 flex flex-col gap-4 items-center justify-center p-8">
          <MemoryLoader />
          <p className="text-sm text-muted-foreground max-w-xs text-center">
            {getProgressDescription(progress)}
          </p>
        </div>

        <CardFooter className="border-t bg-background px-5 py-4">
          <p className="text-xs text-muted-foreground">
            This may take a few seconds...
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};
