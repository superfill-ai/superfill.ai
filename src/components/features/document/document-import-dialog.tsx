import { FileTextIcon, UploadIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ImportDialogFooter,
  ImportDialogShell,
  ImportEmptyState,
  ImportErrorState,
  ImportItemsList,
  ImportLoadingState,
} from "@/components/features/import/import-dialog-shared";
import { Button } from "@/components/ui/button";
import { useImportDialog } from "@/hooks/use-import-dialog";
import { useMemories } from "@/hooks/use-memories";
import {
  convertToImportItems,
  parseDocument,
} from "@/lib/document/document-parser";
import { createLogger } from "@/lib/logger";
import { findDuplicates } from "@/lib/storage/memories";
import type {
  DocumentImportItem,
  DocumentParserStatus,
} from "@/types/document";

const logger = createLogger("component:document-import-dialog");

const STATUS_MESSAGES: Record<DocumentParserStatus, string> = {
  idle: "Ready to import",
  reading: "Reading document...",
  parsing: "AI is extracting information...",
  success: "Information extracted!",
  error: "Failed to extract data",
};

const PROGRESS_BY_STATUS: Record<DocumentParserStatus, number> = {
  idle: 0,
  reading: 30,
  parsing: 60,
  success: 100,
  error: 0,
};

function getDescription(status: DocumentParserStatus): string {
  switch (status) {
    case "idle":
      return "Upload a PDF or text file to extract information.";
    case "success":
      return "Select the information you want to import.";
    case "reading":
      return "Reading your document...";
    case "parsing":
      return "AI is extracting your information...";
    case "error":
      return "Something went wrong. Please try again.";
  }
}

type DocumentImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function DocumentImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: DocumentImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const lastImportKeyRef = useRef<string | null>(null);
  const lastImportTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { entries: existingMemories } = useMemories();

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
  } = useImportDialog<DocumentImportItem, DocumentParserStatus>(
    {
      importTag: "document-import",
      successMessage: "Imported {count} memories!",
      successDescription: "Your document data has been saved as memories.",
      onSuccess,
      onOpenChange,
    },
    "idle",
  );

  const progress = PROGRESS_BY_STATUS[status];

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      const isTxt =
        file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");

      if (!isPdf && !isTxt) {
        setError("Please select a PDF or text file");
        setStatus("error");
        event.target.value = "";
        return;
      }

      const importKey = `${file.name}:${file.size}`;
      const now = Date.now();

      if (
        importKey === lastImportKeyRef.current &&
        now - lastImportTimeRef.current < 5_000
      ) {
        logger.debug("Skipping duplicate import for:", file.name);
        event.target.value = "";
        return;
      }

      lastImportKeyRef.current = importKey;
      lastImportTimeRef.current = now;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setFileName(file.name);
      setStatus("reading");
      setError(null);
      setImportItems([]);

      const currentRequestId = ++requestIdRef.current;
      const requestId = String(currentRequestId);

      try {
        const result = await parseDocument(file, {
          requestId,
          signal: controller.signal,
          onStageChange: (stage) => {
            if (requestIdRef.current !== currentRequestId) return;
            setStatus(stage);
          },
        });

        if (requestIdRef.current !== currentRequestId) return;

        if (!result.success || !result.items) {
          if (result.error === "cancelled") return;

          const errorMsg =
            result.error || "Failed to extract data from document";
          setStatus("error");
          setError(errorMsg);
          toast.error(errorMsg);
          return;
        }

        const items = convertToImportItems(result.items);
        const duplicatesMap = await findDuplicates(items, existingMemories);
        const enrichedItems = items.map((item, i) => {
          const duplicate = duplicatesMap.get(i);
          return duplicate ? { ...item, existingDuplicate: duplicate } : item;
        });

        setImportItems(enrichedItems);
        setStatus("success");

        logger.debug(
          `[req:${requestId}] Successfully extracted document data:`,
          items.length,
          "items",
        );
      } catch (err) {
        if (requestIdRef.current !== currentRequestId) return;
        if (err instanceof Error && err.name === "AbortError") return;

        const errMsg =
          err instanceof Error ? err.message : "An unexpected error occurred";
        logger.error(`[req:${requestId}] Import error:`, err);
        setStatus("error");
        setError(errMsg);
        toast.error(errMsg);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [requestIdRef, setStatus, setError, setImportItems, existingMemories],
  );

  const handleCloseWrapper = (open: boolean) => {
    if (!open) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setFileName(null);
    }
    handleClose(open);
  };

  const handleRetry = () => {
    setStatus("idle");
    setError(null);
    setFileName(null);
  };

  const showFooter = status === "success" && importItems.length > 0;

  return (
    <ImportDialogShell
      open={open}
      onOpenChange={handleCloseWrapper}
      title={
        <>
          <FileTextIcon className="size-5 text-primary" />
          Import from Document
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
        <div className="flex flex-col items-center justify-center py-8 gap-6">
          <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
            <FileTextIcon className="size-10 text-primary" />
          </div>
          <p className="text-xs text-amber-600">
            Requires an AI provider to be configured in settings.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
          >
            <UploadIcon className="size-4" />
            Select Document
          </Button>

          <p className="text-xs text-muted-foreground">
            Supported formats: PDF, TXT
          </p>
        </div>
      )}

      {(status === "reading" || status === "parsing") && (
        <ImportLoadingState
          progress={progress}
          statusMessage={STATUS_MESSAGES[status]}
          extra={
            fileName && (
              <p className="text-xs text-center text-muted-foreground truncate">
                {fileName}
              </p>
            )
          }
        />
      )}

      {status === "error" && (
        <ImportErrorState
          error={error}
          defaultError="Failed to extract data. Please try again."
          onRetry={handleRetry}
        />
      )}

      {status === "success" && importItems.length > 0 && (
        <ImportItemsList
          items={importItems}
          itemIdPrefix="doc-item"
          onToggleItem={handleToggleItem}
          onToggleAll={handleToggleAll}
          headerExtra={
            fileName && (
              <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                from {fileName}
              </span>
            )
          }
        />
      )}

      {status === "success" && importItems.length === 0 && (
        <ImportEmptyState
          message="No useful information could be extracted from this document. Try a different file."
          onRetry={handleRetry}
          retryText="Try Another File"
        />
      )}
    </ImportDialogShell>
  );
}
