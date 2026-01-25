import {
  AlertCircleIcon,
  BrainCircuitIcon,
  BriefcaseIcon,
  CheckCircle2Icon,
  GithubIcon,
  GlobeIcon,
  GraduationCapIcon,
  LinkedinIcon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  SparklesIcon,
  TwitterIcon,
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemoryMutations } from "@/hooks/use-memories";
import { createLogger } from "@/lib/logger";
import { getProfileService } from "@/lib/profile/profile-service";
import type { AllowedCategory, MemoryEntry } from "@/types/memory";
import type { ProfileImportItem, ProfileScraperStatus } from "@/types/profile";

const logger = createLogger("component:profile-import-dialog");

interface ProfileImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const STATUS_MESSAGES: Record<ProfileScraperStatus, string> = {
  idle: "Ready to import",
  "opening-tab": "Opening page...",
  scraping: "Extracting page content...",
  parsing: "AI is analyzing your profile...",
  success: "Profile data extracted!",
  error: "Failed to extract profile",
};

const CATEGORY_ICONS: Record<AllowedCategory, React.ReactNode> = {
  personal: <UserIcon className="size-4" />,
  contact: <MailIcon className="size-4" />,
  location: <MapPinIcon className="size-4" />,
  work: <BriefcaseIcon className="size-4" />,
  education: <GraduationCapIcon className="size-4" />,
  general: <SparklesIcon className="size-4" />,
};

const CATEGORY_COLORS: Record<AllowedCategory, string> = {
  personal: "bg-blue-500/10 text-blue-600 border-blue-200",
  contact: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  location: "bg-green-500/10 text-green-600 border-green-200",
  work: "bg-purple-500/10 text-purple-600 border-purple-200",
  education: "bg-rose-500/10 text-rose-600 border-rose-200",
  general: "bg-amber-500/10 text-amber-600 border-amber-200",
};

const QUICK_SHORTCUTS = [
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: LinkedinIcon,
    url: "https://www.linkedin.com/in/me",
    color: "text-[#0A66C2] hover:bg-[#0A66C2]/10",
  },
  {
    id: "github",
    name: "GitHub",
    icon: GithubIcon,
    url: "",
    color:
      "text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800",
    placeholder: "github.com/username",
  },
  {
    id: "twitter",
    name: "X",
    icon: TwitterIcon,
    url: "",
    color:
      "text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800",
    placeholder: "x.com/username",
  },
];

export function ProfileImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: ProfileImportDialogProps) {
  const { addEntries } = useMemoryMutations();
  const [status, setStatus] = useState<ProfileScraperStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [importItems, setImportItems] = useState<ProfileImportItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const selectedCount = importItems.filter((item) => item.selected).length;

  const PROGRESS_BY_STATUS: Record<ProfileScraperStatus, number> = {
    idle: 0,
    "opening-tab": 20,
    scraping: 40,
    parsing: 70,
    success: 100,
    error: 0,
  };
  const progress = PROGRESS_BY_STATUS[status];

  const handleStartImport = async (url?: string) => {
    const targetUrl = url || urlInput;

    if (!targetUrl.trim()) {
      toast.error("Please enter a profile URL");
      return;
    }

    setStatus("opening-tab");
    setError(null);
    setImportItems([]);

    try {
      const profileService = getProfileService();
      setStatus("scraping");

      const result = await profileService.scrapeProfileUrl(
        targetUrl,
        (newStatus) => {
          if (newStatus === "parsing") {
            setStatus("parsing");
          }
        },
      );

      if (!result.success || !result.items) {
        setStatus("error");
        setError(result.error || "Failed to extract profile data");
        return;
      }

      if (result.items.length === 0) {
        setStatus("error");
        setError(
          "No profile information found. Make sure you're logged in and the page contains profile data.",
        );
        return;
      }

      setImportItems(result.items);
      setStatus("success");

      logger.debug("Successfully extracted profile data:", result.items.length);
    } catch (err) {
      logger.error("Import error:", err);
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    }
  };

  const handleShortcutClick = (shortcut: (typeof QUICK_SHORTCUTS)[0]) => {
    if (shortcut.url) {
      handleStartImport(shortcut.url);
    } else if (shortcut.placeholder) {
      setUrlInput(shortcut.placeholder);
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
          tags: [...item.tags, "profile-import"],
          confidence: 1.0,
        }),
      );

      await addEntries.mutateAsync(entries);

      toast.success(`Imported ${entries.length} memories from profile!`, {
        description: "Your profile data has been saved as memories.",
      });

      logger.debug("Successfully imported memories:", entries.length);

      setStatus("idle");
      setImportItems([]);
      setUrlInput("");
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

  const handleClose = (open: boolean) => {
    if (!open) {
      if (isSaving) return;

      setStatus("idle");
      setError(null);
      setImportItems([]);
      setUrlInput("");
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && urlInput.trim()) {
      handleStartImport();
    }
  };

  const groupedItems = importItems.reduce<
    Partial<Record<AllowedCategory, ProfileImportItem[]>>
  >((acc, item) => {
    const category = item.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GlobeIcon className="size-5 text-primary" />
            Import from Profile
          </DialogTitle>
          <DialogDescription>
            {status === "idle" &&
              "Import your information from any profile page."}
            {status === "success" &&
              "Select the information you want to import."}
            {(status === "opening-tab" || status === "scraping") &&
              "Extracting profile content..."}
            {status === "parsing" && "AI is analyzing your profile..."}
            {status === "error" && "Something went wrong. Please try again."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {status === "idle" && (
            <div className="flex flex-col gap-6 py-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Quick import:</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_SHORTCUTS.map((shortcut) => (
                    <Button
                      key={shortcut.id}
                      variant="outline"
                      size="sm"
                      className={`gap-2 ${shortcut.color}`}
                      onClick={() => handleShortcutClick(shortcut)}
                    >
                      <shortcut.icon className="size-4" />
                      {shortcut.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Or enter any profile URL:
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://linkedin.com/in/username"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => handleStartImport()}
                    disabled={!urlInput.trim()}
                  >
                    Import
                  </Button>
                </div>
              </div>

              <p className="text-xs text-amber-600">
                Make sure you're logged in to the site for full profile access.
                Only use URLs you trust.
              </p>
            </div>
          )}

          {(status === "opening-tab" ||
            status === "scraping" ||
            status === "parsing") && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
                {status === "parsing" ? (
                  <BrainCircuitIcon className="size-10 text-primary animate-pulse" />
                ) : (
                  <Loader2Icon className="size-10 text-primary animate-spin" />
                )}
              </div>
              <div className="w-full max-w-xs space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-center text-muted-foreground">
                  {STATUS_MESSAGES[status]}
                </p>
              </div>
            </div>
          )}

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
                onClick={() => setStatus("idle")}
                variant="outline"
                className="gap-2"
              >
                Try Again
              </Button>
            </div>
          )}

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
                  {Object.entries(groupedItems).map(([category, items]) => (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center gap-2 sticky top-0 bg-background py-1">
                        <span
                          className={`p-1 rounded ${CATEGORY_COLORS[category as AllowedCategory]}`}
                        >
                          {CATEGORY_ICONS[category as AllowedCategory]}
                        </span>
                        <span className="text-sm font-medium capitalize">
                          {category}
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
        </div>

        <DialogFooter>
          {status === "success" && importItems.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
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
