import { Redo2Icon, SparklesIcon, Undo2Icon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { AutofillProgress, FieldOpId, PreviewFieldData } from "@/types/autofill";
import {
  getProgressDescription,
  getProgressTitle,
} from "../lib/progress-utils";
import { MemoryLoader } from "./memory-loader";
import type { PreviewRenderData } from "./preview-manager";

type AutofillContainerProps = {
  mode: "loading" | "preview";
  progress?: AutofillProgress;
  data?: PreviewRenderData;
  onClose: () => void;
  onFill?: (fieldsToFill: { fieldOpid: FieldOpId; value: string }[]) => void;
  onHighlight?: (fieldOpid: FieldOpId) => void;
  onUnhighlight?: () => void;
};

type SelectionState = Set<FieldOpId>;

const confidenceMeta = (confidence: number) => {
  if (confidence >= 0.8) {
    return { label: "High", intent: "success" as const };
  }

  if (confidence >= 0.5) {
    return { label: "Medium", intent: "warning" as const };
  }

  return { label: "Low", intent: "destructive" as const };
};

const getFieldSubtitle = (field: PreviewFieldData) => {
  const purpose = field.metadata.fieldPurpose;
  const type = field.metadata.fieldType;

  if (purpose !== "unknown") {
    return `${purpose} • ${type}`;
  }

  return type;
};

const getSuggestedValue = (field: PreviewFieldData): string => {
  if (field.mapping.rephrasedValue) {
    return field.mapping.rephrasedValue;
  }

  if (field.mapping.value) {
    return field.mapping.value;
  }

  if (
    field.metadata.currentValue &&
    field.metadata.currentValue.trim() !== ""
  ) {
    return field.metadata.currentValue;
  }

  return "No value suggested";
};

const FieldRow = ({
  field,
  selected,
  onToggle,
  onHighlight,
  onUnhighlight,
  onChoiceChange,
}: {
  field: PreviewFieldData;
  selected: boolean;
  onToggle: (next: boolean) => void;
  onChoiceChange: (useOriginal: boolean) => void;
  onHighlight: () => void;
  onUnhighlight: () => void;
}) => {
  const confidence = field.mapping.confidence;
  const { label, intent } = confidenceMeta(confidence);
  const suggestion = getSuggestedValue(field);
  const [useOriginal, setUseOriginal] = useState(false);

  const handleToggleChoice = () => {
    const nextState = !useOriginal;
    setUseOriginal(nextState);
    onChoiceChange(nextState);
  };

  const finalSuggestion = useOriginal
    ? (field.mapping.value ?? suggestion)
    : suggestion;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: highlighting only
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card/80 p-3 transition hover:border-primary/70 max-w-80",
        selected && "border-primary shadow-sm",
      )}
      onMouseEnter={onHighlight}
      onMouseLeave={onUnhighlight}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 text-foreground">
            {field.primaryLabel}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {getFieldSubtitle(field)}
            </p>
            <Badge
              variant={
                intent === "success"
                  ? "secondary"
                  : intent === "warning"
                    ? "outline"
                    : "destructive"
              }
            >
              {label} · {Math.round(confidence * 100)}%
            </Badge>
          </div>
        </div>
        <Switch checked={selected} onCheckedChange={onToggle} />
      </div>

      <div
        className={cn(
          "space-y-1 rounded-md p-2 text-xs",
          field.mapping.rephrasedValue &&
          (!useOriginal ? "bg-primary/5" : "bg-muted/50"),
        )}
      >
        {field.mapping.rephrasedValue && (
          <div className="flex items-center justify-between">
            <p
              className={cn(
                "flex items-center gap-1.5 font-semibold",
                !useOriginal ? "text-primary/90" : "text-muted-foreground",
              )}
            >
              {!useOriginal && <SparklesIcon className="size-3.5" />}
              {useOriginal ? "Original Memory" : "AI Rephrased Memory"}
            </p>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 gap-1.5 text-muted-foreground"
              onClick={handleToggleChoice}
            >
              {useOriginal ? (
                <>
                  <Redo2Icon className="size-3" /> Use AI version
                </>
              ) : (
                <>
                  <Undo2Icon className="size-3" /> Use original
                </>
              )}
            </Button>
          </div>
        )}
        <p
          className={cn(
            "text-xs leading-relaxed wrap-break-word pt-1",
            useOriginal ? "text-foreground" : "text-muted-foreground/90",
          )}
        >
          {finalSuggestion}
        </p>
      </div>

      {field.mapping.reasoning && (
        <p className="text-xs text-muted-foreground/80 leading-relaxed wrap-break-word">
          {field.mapping.reasoning}
        </p>
      )}
      {field.mapping.alternativeMatches.length > 0 && (
        <div className="space-y-1 rounded-md border border-dashed border-border/60 bg-muted/30 p-2">
          <p className="text-xs font-medium text-muted-foreground">
            Alternative matches
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground truncate">
            {field.mapping.alternativeMatches.map((alt) => (
              <li key={`${field.fieldOpid}-alt-${alt.memoryId}`}>
                {alt.value} · {Math.round(alt.confidence * 100)}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const AutofillContainer = ({
  mode,
  progress,
  data,
  onClose,
  onFill,
  onHighlight,
  onUnhighlight,
}: AutofillContainerProps) => {
  const [isContentTransitioning, setIsContentTransitioning] = useState(false);
  const [currentMode, setCurrentMode] = useState<"loading" | "preview">(mode);

  useEffect(() => {
    if (mode !== currentMode) {
      setIsContentTransitioning(true);
      const fadeOutTimer = setTimeout(() => {
        setCurrentMode(mode);
        setIsContentTransitioning(false);
      }, 150);

      return () => clearTimeout(fadeOutTimer);
    }
  }, [mode, currentMode]);

  const initialSelection = useMemo(() => {
    if (!data) return new Set<FieldOpId>();

    const next: SelectionState = new Set();
    for (const form of data.forms) {
      for (const field of form.fields) {
        if (field.mapping.autoFill && field.mapping.value) {
          next.add(field.fieldOpid);
        }
      }
    }
    return next;
  }, [data]);

  const [selection, setSelection] = useState<SelectionState>(initialSelection);
  const [fieldChoices, setFieldChoices] = useState<Map<FieldOpId, boolean>>(
    new Map(),
  );

  useEffect(() => {
    setSelection(new Set(initialSelection));
  }, [initialSelection]);

  const selectedCount = selection.size;
  const totalFields = data?.summary.totalFields ?? 0;

  const handleFill = () => {
    if (!data || !onFill) return;

    const fieldsToFill: { fieldOpid: FieldOpId; value: string }[] = [];

    for (const form of data.forms) {
      for (const field of form.fields) {
        if (selection.has(field.fieldOpid)) {
          const useOriginal = fieldChoices.get(field.fieldOpid) ?? false;
          const valueToFill = useOriginal
            ? field.mapping.value
            : (field.mapping.rephrasedValue ?? field.mapping.value);

          if (valueToFill) {
            fieldsToFill.push({
              fieldOpid: field.fieldOpid,
              value: valueToFill,
            });
          }
        }
      }
    }

    onFill(fieldsToFill);
  };

  const handleToggle = (fieldOpid: FieldOpId, next: boolean) => {
    setSelection((prev) => {
      const updated = new Set(prev);
      if (next) {
        updated.add(fieldOpid);
      } else {
        updated.delete(fieldOpid);
      }
      return updated;
    });
  };

  const handleChoiceChange = (fieldOpid: FieldOpId, useOriginal: boolean) => {
    setFieldChoices((prev) => {
      const updated = new Map(prev);
      updated.set(fieldOpid, useOriginal);
      return updated;
    });
  };

  const headerTitle = currentMode === "loading"
    ? getProgressTitle(progress?.state ?? "detecting")
    : "Autofill suggestions";

  const headerDescription = currentMode === "loading"
    ? "Please do not navigate away from this page."
    : `${data?.summary.matchedFields ?? 0} of ${totalFields} fields have matches${typeof data?.summary.processingTime === "number"
      ? ` · ${Math.round(data.summary.processingTime)}ms`
      : ""
    }`;

  const headerIcon = currentMode === "loading"
    ? (progress?.state === "failed" ? <XIcon className="size-4" /> : <Spinner className="size-4" />)
    : null;

  return (
    <div className="pointer-events-auto h-full w-full flex flex-col text-foreground border-l border-border shadow-lg animate-[slide-in-right_0.3s_ease-out]">
      <Card className="flex h-full flex-col rounded-none border-0 shadow-none p-0 gap-0">
        <CardHeader className="border-b bg-background/95 px-5 py-4 flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              {headerIcon}
              {headerTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {headerDescription}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon />
          </Button>
        </CardHeader>

        <CardContent
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-0 px-5 py-4 transition-opacity duration-150",
            isContentTransitioning ? "opacity-0" : "opacity-100",
          )}
        >
          {currentMode === "loading" && progress ? (
            <div className="flex-1 flex flex-col gap-4 items-center justify-center">
              <MemoryLoader />
              <p className="text-sm text-muted-foreground max-w-xs text-center">
                {getProgressDescription(progress, "preview")}
              </p>
            </div>
          ) : currentMode === "preview" && data ? (
            <ScrollArea className="flex-1 min-h-0">
              <Accordion
                type="multiple"
                defaultValue={data.forms.map(
                  (form: PreviewRenderData["forms"][number]) =>
                    form.snapshot.opid,
                )}
              >
                {data.forms.map((form: PreviewRenderData["forms"][number]) => (
                  <AccordionItem
                    value={form.snapshot.opid}
                    key={form.snapshot.opid}
                  >
                    <AccordionTrigger className="text-left text-sm font-semibold">
                      {form.snapshot.name || "Unnamed form"}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 py-2">
                        {form.fields.map((field: PreviewFieldData) => (
                          <FieldRow
                            key={field.fieldOpid}
                            field={field}
                            selected={selection.has(field.fieldOpid)}
                            onToggle={(next) =>
                              handleToggle(field.fieldOpid, next)
                            }
                            onChoiceChange={(useOriginal) =>
                              handleChoiceChange(field.fieldOpid, useOriginal)
                            }
                            onHighlight={() => onHighlight?.(field.fieldOpid)}
                            onUnhighlight={() => onUnhighlight?.()}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </ScrollArea>
          ) : null}
        </CardContent>

        <CardFooter className="border-t bg-background px-5 py-4">
          {currentMode === "loading" ? (
            <p className="text-xs text-muted-foreground">
              This may take a few seconds...
            </p>
          ) : (
            <div className="flex w-full items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {selectedCount} of {totalFields} fields selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleFill}
                  disabled={selectedCount === 0}
                >
                  Fill selected
                </Button>
              </div>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};
