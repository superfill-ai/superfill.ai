import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";
import { useState } from "react";
import type { CapturedFieldData } from "@/types/autofill";

interface CaptureConfirmationProps {
  capturedFields: CapturedFieldData[];
  onSave: () => void;
  onDismiss: () => void;
  onNeverAsk: () => void;
}

export function CaptureConfirmation({
  capturedFields,
  onSave,
  onDismiss,
  onNeverAsk,
}: CaptureConfirmationProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const modifiedCount = capturedFields.filter((f) => f.wasAIFilled).length;
  const unfilledCount = capturedFields.filter((f) => !f.wasAIFilled).length;

  return (
    <div className="fixed top-4 right-4 z-999999 max-w-md animate-in slide-in-from-top-5">
      <Card className="shadow-lg border-2 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">Save to Memories?</CardTitle>
              <CardDescription className="text-sm mt-1">
                {modifiedCount > 0 && unfilledCount > 0 && (
                  <>
                    {modifiedCount} modified field{modifiedCount !== 1 ? "s" : ""} and{" "}
                    {unfilledCount} unfilled field{unfilledCount !== 1 ? "s" : ""} detected
                  </>
                )}
                {modifiedCount > 0 && unfilledCount === 0 && (
                  <>
                    {modifiedCount} modified field{modifiedCount !== 1 ? "s" : ""} detected
                  </>
                )}
                {modifiedCount === 0 && unfilledCount > 0 && (
                  <>
                    {unfilledCount} unfilled field{unfilledCount !== 1 ? "s" : ""} detected
                  </>
                )}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1 -mr-2"
              onClick={onDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {isExpanded && (
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2 bg-muted/30">
              {capturedFields.slice(0, 5).map((field) => (
                <div key={field.fieldOpid} className="text-xs space-y-1 pb-2 border-b last:border-0 last:pb-0">
                  <div className="font-medium text-foreground">
                    {field.question || "Unknown field"}
                  </div>
                  <div className="text-muted-foreground truncate">
                    {field.answer || "(empty)"}
                  </div>
                  {field.wasAIFilled && (
                    <div className="text-xs text-primary">Modified from AI suggestion</div>
                  )}
                </div>
              ))}
              {capturedFields.length > 5 && (
                <div className="text-xs text-muted-foreground text-center pt-1">
                  ... and {capturedFields.length - 5} more
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={onSave}>
              Save All
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? "Hide" : "Review"}
            </Button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="w-full text-xs"
            onClick={onNeverAsk}
          >
            Never for this site
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
