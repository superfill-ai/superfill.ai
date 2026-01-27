import {
  BrainCircuitIcon,
  GithubIcon,
  GlobeIcon,
  LinkedinIcon,
  Loader2Icon,
  TwitterIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ImportDialogFooter,
  ImportDialogShell,
  ImportErrorState,
  ImportItemsList,
  ImportLoadingState,
} from "@/components/features/import/import-dialog-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useImportDialog } from "@/hooks/use-import-dialog";
import { createLogger } from "@/lib/logger";
import { getProfileService } from "@/lib/profile/profile-service";
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

const PROGRESS_BY_STATUS: Record<ProfileScraperStatus, number> = {
  idle: 0,
  "opening-tab": 20,
  scraping: 40,
  parsing: 70,
  success: 100,
  error: 0,
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

function getDescription(status: ProfileScraperStatus): string {
  switch (status) {
    case "idle":
      return "Import your information from any profile page.";
    case "success":
      return "Select the information you want to import.";
    case "opening-tab":
    case "scraping":
      return "Extracting profile content...";
    case "parsing":
      return "AI is analyzing your profile...";
    case "error":
      return "Something went wrong. Please try again.";
  }
}

export function ProfileImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: ProfileImportDialogProps) {
  const [urlInput, setUrlInput] = useState("");

  const {
    status,
    setStatus,
    error,
    setError,
    importItems,
    setImportItems,
    isSaving,
    selectedCount,
    requestIdRef,
    handleToggleItem,
    handleToggleAll,
    handleSaveSelected,
    handleClose,
  } = useImportDialog<ProfileImportItem, ProfileScraperStatus>(
    {
      importTag: "profile-import",
      successMessage: "Imported {count} memories from profile!",
      successDescription: "Your profile data has been saved as memories.",
      onSuccess,
      onOpenChange,
    },
    "idle",
  );

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

    const currentRequestId = ++requestIdRef.current;

    try {
      const profileService = getProfileService();
      setStatus("scraping");

      const result = await profileService.scrapeProfileUrl(
        targetUrl,
        (newStatus) => {
          if (requestIdRef.current !== currentRequestId) return;
          if (newStatus === "parsing") {
            setStatus("parsing");
          }
        },
      );

      if (requestIdRef.current !== currentRequestId) return;

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
      if (requestIdRef.current !== currentRequestId) return;

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

  const handleCloseWrapper = (open: boolean) => {
    if (!open) {
      setUrlInput("");
    }
    handleClose(open);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && urlInput.trim()) {
      handleStartImport();
    }
  };

  const showFooter = status === "success" && importItems.length > 0;

  return (
    <ImportDialogShell
      open={open}
      onOpenChange={handleCloseWrapper}
      title={
        <>
          <GlobeIcon className="size-5 text-primary" />
          Import from Profile
        </>
      }
      description={getDescription(status)}
      footer={
        showFooter ? (
          <ImportDialogFooter
            selectedCount={selectedCount}
            isSaving={isSaving}
            onCancel={() => handleCloseWrapper(false)}
            onSave={handleSaveSelected}
          />
        ) : undefined
      }
    >
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
            Make sure you're logged in to the site for full profile access. Only
            use URLs you trust.
          </p>
        </div>
      )}

      {(status === "opening-tab" ||
        status === "scraping" ||
        status === "parsing") && (
        <ImportLoadingState
          progress={progress}
          statusMessage={STATUS_MESSAGES[status]}
          icon={
            status === "parsing" ? (
              <BrainCircuitIcon className="size-10 text-primary animate-pulse" />
            ) : (
              <Loader2Icon className="size-10 text-primary animate-spin" />
            )
          }
        />
      )}

      {status === "error" && (
        <ImportErrorState
          error={error}
          defaultError="Failed to extract profile data. Please try again."
          onRetry={() => setStatus("idle")}
        />
      )}

      {status === "success" && importItems.length > 0 && (
        <ImportItemsList
          items={importItems}
          itemIdPrefix="profile-item"
          onToggleItem={handleToggleItem}
          onToggleAll={handleToggleAll}
        />
      )}
    </ImportDialogShell>
  );
}
