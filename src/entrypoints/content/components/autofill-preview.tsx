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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { FieldOpId, PreviewFieldData } from "@/types/autofill";
import { XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PreviewRenderData } from "../preview-manager";

type AutofillPreviewProps = {
  data: PreviewRenderData;
  onClose: () => void;
  onFill: (fieldOpids: FieldOpId[]) => void;
  onHighlight: (fieldOpid: FieldOpId) => void;
  onUnhighlight: () => void;
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
  if (field.mapping.value) {
    return field.mapping.value;
  }

  if (field.metadata.currentValue) {
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
}: {
  field: PreviewFieldData;
  selected: boolean;
  onToggle: (next: boolean) => void;
  onHighlight: () => void;
  onUnhighlight: () => void;
}) => {
  const confidence = field.mapping.confidence;
  const { label, intent } = confidenceMeta(confidence);
  const suggestion = getSuggestedValue(field);

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
          <p className="text-xs text-muted-foreground">
            {getFieldSubtitle(field)}
          </p>
        </div>
        <Switch checked={selected} onCheckedChange={onToggle} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate" title={suggestion}>
          {suggestion}
        </span>
        <Separator orientation="vertical" className="h-3" />
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

export const AutofillPreview = ({
  data,
  onClose,
  onFill,
  onHighlight,
  onUnhighlight,
}: AutofillPreviewProps) => {
  const initialSelection = useMemo(() => {
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

  useEffect(() => {
    setSelection(new Set(initialSelection));
  }, [initialSelection]);

  const selectedCount = selection.size;
  const totalFields = data.summary.totalFields;

  const handleFill = () => {
    onFill(Array.from(selection));
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

  return (
    <div className="pointer-events-auto flex h-full w-full flex-col bg-background text-foreground border-l border-border shadow-lg">
      <Card className="flex h-full flex-col rounded-none border-0 shadow-none p-0 gap-0">
        <CardHeader className="border-b bg-background/95 px-5 py-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Autofill suggestions</CardTitle>
            <CardDescription className="text-xs">
              {data.summary.matchedFields} of {totalFields} fields have matches
              {typeof data.summary.processingTime === "number"
                ? ` · ${Math.round(data.summary.processingTime)}ms`
                : ""}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon />
          </Button>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-0 px-5 py-4">
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
                          onHighlight={() => onHighlight(field.fieldOpid)}
                          onUnhighlight={onUnhighlight}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        </CardContent>

        <CardFooter className="border bg-background flex items-center justify-between gap-3 px-5 py-4">
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
        </CardFooter>
      </Card>
    </div>
  );
};
