import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useMemoryMutations } from "@/hooks/use-memories";
import { createLogger } from "@/lib/logger";
import type { BaseImportItem } from "@/types/import";
import type { MemoryEntry } from "@/types/memory";

const logger = createLogger("hook:use-import-dialog");

interface UseImportDialogOptions<_TItem extends BaseImportItem> {
  importTag: string;
  successMessage: string;
  successDescription: string;
  onSuccess?: () => void;
  onOpenChange: (open: boolean) => void;
}

interface UseImportDialogReturn<
  TItem extends BaseImportItem,
  TStatus extends string,
> {
  status: TStatus;
  setStatus: React.Dispatch<React.SetStateAction<TStatus>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  importItems: TItem[];
  setImportItems: React.Dispatch<React.SetStateAction<TItem[]>>;
  isSaving: boolean;
  selectedCount: number;
  requestIdRef: React.MutableRefObject<number>;
  handleToggleItem: (itemId: string) => void;
  handleToggleAll: () => void;
  handleSaveSelected: () => Promise<void>;
  handleClose: (open: boolean) => void;
  resetState: () => void;
}

export function useImportDialog<
  TItem extends BaseImportItem,
  TStatus extends string,
>(
  options: UseImportDialogOptions<TItem>,
  initialStatus: TStatus,
): UseImportDialogReturn<TItem, TStatus> {
  const {
    importTag,
    successMessage,
    successDescription,
    onSuccess,
    onOpenChange,
  } = options;

  const { addEntries } = useMemoryMutations();
  const requestIdRef = useRef<number>(0);

  const [status, setStatus] = useState<TStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [importItems, setImportItems] = useState<TItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const selectedCount = importItems.filter((item) => item.selected).length;

  const handleToggleItem = useCallback((itemId: string) => {
    setImportItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, selected: !item.selected } : item,
      ),
    );
  }, []);

  const handleToggleAll = useCallback(() => {
    setImportItems((prev) => {
      const allSelected = prev.every((item) => item.selected);
      return prev.map((item) => ({ ...item, selected: !allSelected }));
    });
  }, []);

  const resetState = useCallback(() => {
    setStatus(initialStatus);
    setError(null);
    setImportItems([]);
  }, [initialStatus]);

  const handleSaveSelected = useCallback(async () => {
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
          tags: [...item.tags, importTag],
          confidence: 1.0,
        }),
      );

      await addEntries.mutateAsync(entries);

      toast.success(successMessage.replace("{count}", String(entries.length)), {
        description: successDescription,
      });

      logger.debug("Successfully imported memories:", entries.length);

      resetState();
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
  }, [
    importItems,
    addEntries,
    importTag,
    successMessage,
    successDescription,
    resetState,
    onOpenChange,
    onSuccess,
  ]);

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) {
        if (isSaving) return;

        requestIdRef.current++;
        resetState();
        onOpenChange(false);
      }
    },
    [isSaving, resetState, onOpenChange],
  );

  return {
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
    resetState,
  };
}
