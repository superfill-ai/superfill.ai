import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemoryMutations } from "@/hooks/use-memories";
import { createLogger } from "@/lib/logger";
import {
    convertResumeToImportItems,
    parseResumePDF,
} from "@/lib/resume/resume-parser";
import type { MemoryEntry } from "@/types/memory";
import type {
    ResumeData,
    ResumeImportItem,
    ResumeParserStatus,
} from "@/types/resume";
import {
    AlertCircleIcon,
    AwardIcon,
    BriefcaseIcon,
    CheckCircle2Icon,
    FileTextIcon,
    FolderKanbanIcon,
    GraduationCapIcon,
    Loader2Icon,
    MailIcon,
    MedalIcon,
    SparklesIcon,
    UploadIcon,
    UserIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const logger = createLogger("component:resume-import-dialog");

interface ResumeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const STATUS_MESSAGES: Record<ResumeParserStatus, string> = {
  idle: "Ready to import",
  reading: "Reading PDF file...",
  parsing: "Extracting information...",
  success: "Resume data extracted!",
  error: "Failed to extract data",
};

const SOURCE_ICONS: Record<ResumeImportItem["source"], React.ReactNode> = {
  name: <UserIcon className="size-4" />,
  contact: <MailIcon className="size-4" />,
  summary: <UserIcon className="size-4" />,
  experience: <BriefcaseIcon className="size-4" />,
  education: <GraduationCapIcon className="size-4" />,
  skills: <SparklesIcon className="size-4" />,
  projects: <FolderKanbanIcon className="size-4" />,
  achievements: <MedalIcon className="size-4" />,
  certifications: <AwardIcon className="size-4" />,
  other: <FileTextIcon className="size-4" />,
};

const SOURCE_COLORS: Record<ResumeImportItem["source"], string> = {
  name: "bg-blue-500/10 text-blue-600 border-blue-200",
  contact: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  summary: "bg-amber-500/10 text-amber-600 border-amber-200",
  experience: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
  education: "bg-rose-500/10 text-rose-600 border-rose-200",
  skills: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
  projects: "bg-purple-500/10 text-purple-600 border-purple-200",
  achievements: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  certifications: "bg-orange-500/10 text-orange-600 border-orange-200",
  other: "bg-gray-500/10 text-gray-600 border-gray-200",
};

export function ResumeImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: ResumeImportDialogProps) {
  const { addEntries } = useMemoryMutations();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ResumeParserStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [_resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [importItems, setImportItems] = useState<ResumeImportItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const selectedCount = importItems.filter((item) => item.selected).length;
  const progress =
    status === "idle"
      ? 0
      : status === "reading"
        ? 30
        : status === "parsing"
          ? 60
          : status === "success"
            ? 100
            : 0;

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file");
      setStatus("error");
      return;
    }

    setFileName(file.name);
    setStatus("reading");
    setError(null);
    setResumeData(null);
    setImportItems([]);

    try {
      setStatus("parsing");
      const result = await parseResumePDF(file);

      if (!result.success || !result.data) {
        setStatus("error");
        setError(result.error || "Failed to extract data from PDF");
        return;
      }

      setResumeData(result.data);
      const items = convertResumeToImportItems(result.data);
      setImportItems(items);
      setStatus("success");

      logger.debug("Successfully extracted resume data:", result.data);
    } catch (err) {
      logger.error("Import error:", err);
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleToggleItem = (itemId: string) => {
    setImportItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  const handleToggleAll = () => {
    const allSelected = importItems.every((item) => item.selected);
    setImportItems((prev) =>
      prev.map((item) => ({ ...item, selected: !allSelected })),
    );
  };

  const handleSaveSelected = async () => {
    const selectedItems = importItems.filter((item) => item.selected);

    if (selectedItems.length === 0) {
      toast.error("Please select at least one item to import");
      return;
    }

    setIsSaving(true);

    try {
      const entries: Omit<MemoryEntry, "id" | "metadata">[] = selectedItems.map(
        (item) => ({
          question: item.question,
          answer: item.answer,
          category: item.category,
          tags: [...item.tags, "resume-import"],
          confidence: 1.0,
        }),
      );

      await addEntries.mutateAsync(entries);

      toast.success(`Imported ${entries.length} memories from resume!`, {
        description: "Your resume data has been saved as memories.",
      });

      logger.debug("Successfully imported memories:", entries.length);

      // Reset state
      setStatus("idle");
      setResumeData(null);
      setImportItems([]);
      setFileName(null);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      logger.error("Failed to save memories:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save memories",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (status !== "reading" && status !== "parsing" && !isSaving) {
      setStatus("idle");
      setError(null);
      setResumeData(null);
      setImportItems([]);
      setFileName(null);
      onOpenChange(false);
    }
  };

  const groupedItems = importItems.reduce(
    (acc, item) => {
      if (!acc[item.source]) {
        acc[item.source] = [];
      }
      acc[item.source].push(item);
      return acc;
    },
    {} as Record<ResumeImportItem["source"], ResumeImportItem[]>,
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileTextIcon className="size-5 text-primary" />
            Import from Resume
          </DialogTitle>
          <DialogDescription>
            {status === "success" &&
              "Select the information you want to import as memories."}
            {(status === "reading" || status === "parsing") &&
              "Please wait while we extract your resume data..."}
            {status === "error" && "Something went wrong. Please try again."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Initial State */}
          {status === "idle" && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
                <FileTextIcon className="size-10 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground max-w-sm">
                  Upload your resume PDF and we'll extract your information to
                  create memories for auto-filling forms.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="hidden"
              />

              <Button
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <UploadIcon className="size-4" />
                Select PDF Resume
              </Button>

              <p className="text-xs text-muted-foreground">
                Supported format: PDF
              </p>
            </div>
          )}

          {/* Loading State */}
          {(status === "reading" || status === "parsing") && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2Icon className="size-10 text-primary animate-spin" />
              </div>
              <div className="w-full max-w-xs space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-center text-muted-foreground">
                  {STATUS_MESSAGES[status]}
                </p>
                {fileName && (
                  <p className="text-xs text-center text-muted-foreground truncate">
                    {fileName}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error State */}
          {status === "error" && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="size-20 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircleIcon className="size-10 text-destructive" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground max-w-sm">
                  {error ||
                    "Failed to extract data from PDF. Please try again."}
                </p>
              </div>
              <Button
                onClick={() => {
                  setStatus("idle");
                  setError(null);
                }}
                variant="outline"
                className="gap-2"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Success State - Preview */}
          {status === "success" && importItems.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2Icon className="size-5 text-green-500" />
                  <span className="text-sm font-medium">
                    Found {importItems.length} items
                  </span>
                  {fileName && (
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                      from {fileName}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleAll}
                  className="text-xs"
                >
                  {importItems.every((item) => item.selected)
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>

              <ScrollArea className="h-[350px] pr-4">
                <div className="space-y-4">
                  {Object.entries(groupedItems).map(([source, items]) => (
                    <div key={source} className="space-y-2">
                      <div className="flex items-center gap-2 sticky top-0 bg-background py-1">
                        <span
                          className={`p-1 rounded ${SOURCE_COLORS[source as ResumeImportItem["source"]]}`}
                        >
                          {SOURCE_ICONS[source as ResumeImportItem["source"]]}
                        </span>
                        <span className="text-sm font-medium capitalize">
                          {source}
                        </span>
                        <Badge variant="secondary" size="sm">
                          {items.length}
                        </Badge>
                      </div>

                      <div className="space-y-1 pl-2">
                        {items.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => handleToggleItem(item.id)}
                            className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors w-full text-left"
                          >
                            <Checkbox
                              checked={item.selected}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {item.label}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {item.answer}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* No Data Found */}
          {status === "success" && importItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="size-20 rounded-full bg-muted flex items-center justify-center">
                <AlertCircleIcon className="size-10 text-muted-foreground" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground max-w-sm">
                  No data could be extracted from the PDF. The file might be
                  image-based or have an unsupported format.
                </p>
              </div>
              <Button
                onClick={() => {
                  setStatus("idle");
                  setError(null);
                }}
                variant="outline"
                className="gap-2"
              >
                Try Another File
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          {status === "success" && importItems.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveSelected}
                disabled={selectedCount === 0 || isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="size-4" />
                    Import {selectedCount}{" "}
                    {selectedCount === 1 ? "Memory" : "Memories"}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
