import {
  AlertCircleIcon,
  BriefcaseIcon,
  CheckCircle2Icon,
  GraduationCapIcon,
  LinkedinIcon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { getLinkedInService } from "@/lib/linkedin/linkedin-service";
import { createLogger } from "@/lib/logger";
import type {
  LinkedInImportItem,
  LinkedInProfileData,
  LinkedInScraperStatus,
} from "@/types/linkedin";
import type { MemoryEntry } from "@/types/memory";

const logger = createLogger("component:linkedin-import-dialog");

interface LinkedInImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const STATUS_MESSAGES: Record<LinkedInScraperStatus, string> = {
  idle: "Ready to import",
  "opening-tab": "Opening LinkedIn...",
  "waiting-for-login": "Please log in to LinkedIn",
  scraping: "Extracting your profile data...",
  success: "Profile data extracted!",
  error: "Failed to extract profile",
};

const SOURCE_ICONS: Record<LinkedInImportItem["source"], React.ReactNode> = {
  name: <UserIcon className="size-4" />,
  headline: <BriefcaseIcon className="size-4" />,
  location: <MapPinIcon className="size-4" />,
  about: <UserIcon className="size-4" />,
  experience: <BriefcaseIcon className="size-4" />,
  education: <GraduationCapIcon className="size-4" />,
  skills: <SparklesIcon className="size-4" />,
  contact: <MailIcon className="size-4" />,
};

const SOURCE_COLORS: Record<LinkedInImportItem["source"], string> = {
  name: "bg-blue-500/10 text-blue-600 border-blue-200",
  headline: "bg-purple-500/10 text-purple-600 border-purple-200",
  location: "bg-green-500/10 text-green-600 border-green-200",
  about: "bg-amber-500/10 text-amber-600 border-amber-200",
  experience: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
  education: "bg-rose-500/10 text-rose-600 border-rose-200",
  skills: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
  contact: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
};

export function LinkedInImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: LinkedInImportDialogProps) {
  const { addEntries } = useMemoryMutations();
  const [status, setStatus] = useState<LinkedInScraperStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [_profileData, setProfileData] = useState<LinkedInProfileData | null>(
    null,
  );
  const [importItems, setImportItems] = useState<LinkedInImportItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const selectedCount = importItems.filter((item) => item.selected).length;
  const progress =
    status === "idle"
      ? 0
      : status === "opening-tab"
        ? 25
        : status === "scraping"
          ? 50
          : status === "success"
            ? 100
            : 0;

  const handleStartImport = async () => {
    setStatus("opening-tab");
    setError(null);
    setProfileData(null);
    setImportItems([]);

    try {
      const linkedInService = getLinkedInService();
      setStatus("scraping");

      const result = await linkedInService.scrapeLinkedInProfile();

      if (result.requiresLogin) {
        setStatus("waiting-for-login");
        setError(
          "Please log in to LinkedIn in the opened tab, then try again.",
        );
        return;
      }

      if (!result.success || !result.data) {
        setStatus("error");
        setError(result.error || "Failed to extract profile data");
        return;
      }

      setProfileData(result.data);
      const items = linkedInService.convertToImportItems(result.data);
      setImportItems(items);
      setStatus("success");

      logger.debug("Successfully extracted profile data:", result.data);
    } catch (err) {
      logger.error("Import error:", err);
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
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
          tags: [...item.tags, "linkedin-import"],
          confidence: 1.0,
        }),
      );

      await addEntries.mutateAsync(entries);

      toast.success(`Imported ${entries.length} memories from LinkedIn!`, {
        description: "Your profile data has been saved as memories.",
      });

      logger.debug("Successfully imported memories:", entries.length);

      // Reset state
      setStatus("idle");
      setProfileData(null);
      setImportItems([]);
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
    if (status !== "scraping" && !isSaving) {
      setStatus("idle");
      setError(null);
      setProfileData(null);
      setImportItems([]);
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
    {} as Record<LinkedInImportItem["source"], LinkedInImportItem[]>,
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkedinIcon className="size-5 text-[#0A66C2]" />
            Import from LinkedIn
          </DialogTitle>
          <DialogDescription>
            {status === "idle" &&
              "Import your profile information from LinkedIn to auto-fill forms."}
            {status === "success" &&
              "Select the information you want to import as memories."}
            {(status === "opening-tab" || status === "scraping") &&
              "Please wait while we extract your profile data..."}
            {status === "waiting-for-login" &&
              "Log in to LinkedIn in the opened tab, then click 'Try Again'."}
            {status === "error" && "Something went wrong. Please try again."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Initial State */}
          {status === "idle" && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="size-20 rounded-full bg-[#0A66C2]/10 flex items-center justify-center">
                <LinkedinIcon className="size-10 text-[#0A66C2]" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground max-w-sm">
                  We'll open your LinkedIn profile in a new tab and extract your
                  information. The tab will close automatically when done.
                </p>
              </div>
              <Button onClick={handleStartImport} className="gap-2">
                <LinkedinIcon className="size-4" />
                Connect LinkedIn
              </Button>
            </div>
          )}

          {/* Loading State */}
          {(status === "opening-tab" || status === "scraping") && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2Icon className="size-10 text-primary animate-spin" />
              </div>
              <div className="w-full max-w-xs space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-center text-muted-foreground">
                  {STATUS_MESSAGES[status]}
                </p>
              </div>
            </div>
          )}

          {/* Login Required State */}
          {status === "waiting-for-login" && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="size-20 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertCircleIcon className="size-10 text-amber-500" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground max-w-sm">
                  {error}
                </p>
              </div>
              <Button
                onClick={handleStartImport}
                variant="outline"
                className="gap-2"
              >
                Try Again
              </Button>
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
                  {error || "Failed to extract profile data. Please try again."}
                </p>
              </div>
              <Button
                onClick={handleStartImport}
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
                          className={`p-1 rounded ${SOURCE_COLORS[source as LinkedInImportItem["source"]]}`}
                        >
                          {SOURCE_ICONS[source as LinkedInImportItem["source"]]}
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
                              onCheckedChange={() => handleToggleItem(item.id)}
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
                  No profile data was found. Make sure you're logged in and have
                  a complete LinkedIn profile.
                </p>
              </div>
              <Button
                onClick={handleStartImport}
                variant="outline"
                className="gap-2"
              >
                Try Again
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
