import {
  AlertCircleIcon,
  BriefcaseIcon,
  CheckCircle2Icon,
  FileTextIcon,
  GraduationCapIcon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
import type React from "react";
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
import type { BaseImportItem } from "@/types/import";
import type { AllowedCategory } from "@/types/memory";

export const CATEGORY_ICONS: Record<AllowedCategory, React.ReactNode> = {
  personal: <UserIcon className="size-4" />,
  contact: <MailIcon className="size-4" />,
  location: <MapPinIcon className="size-4" />,
  work: <BriefcaseIcon className="size-4" />,
  education: <GraduationCapIcon className="size-4" />,
  general: <FileTextIcon className="size-4" />,
};

export const CATEGORY_COLORS: Record<AllowedCategory, string> = {
  personal: "bg-blue-500/10 text-blue-600 border-blue-200",
  contact: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  location: "bg-amber-500/10 text-amber-600 border-amber-200",
  work: "bg-purple-500/10 text-purple-600 border-purple-200",
  education: "bg-rose-500/10 text-rose-600 border-rose-200",
  general: "bg-gray-500/10 text-gray-600 border-gray-200",
};

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ImportItemsListProps<T extends BaseImportItem> {
  items: T[];
  itemIdPrefix: string;
  onToggleItem: (itemId: string) => void;
  onToggleAll: () => void;
  headerExtra?: React.ReactNode;
}

export function ImportItemsList<T extends BaseImportItem>({
  items,
  itemIdPrefix,
  onToggleItem,
  onToggleAll,
  headerExtra,
}: ImportItemsListProps<T>) {
  const groupedItems = items.reduce<Partial<Record<AllowedCategory, T[]>>>(
    (acc, item) => {
      const category = item.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category]?.push(item);
      return acc;
    },
    {},
  );

  const allSelected = items.every((item) => item.selected);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2Icon className="size-5 text-green-500" />
          <span className="text-sm font-medium">
            Found {items.length} items
          </span>
          {headerExtra}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleAll}
          className="text-xs"
        >
          {allSelected ? "Deselect All" : "Select All"}
        </Button>
      </div>

      <ScrollArea className="h-[350px] pr-4">
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
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
                  {categoryItems?.length}
                </Badge>
              </div>

              <div className="space-y-1 pl-2">
                {categoryItems?.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors w-full"
                  >
                    <Checkbox
                      id={`${itemIdPrefix}-${item.id}`}
                      checked={item.selected}
                      onCheckedChange={() => onToggleItem(item.id)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`${itemIdPrefix}-${item.id}`}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <p className="text-sm font-medium truncate">
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.answer}
                      </p>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface ImportLoadingStateProps {
  progress: number;
  statusMessage: string;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
}

export function ImportLoadingState({
  progress,
  statusMessage,
  icon,
  extra,
}: ImportLoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-6">
      <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
        {icon || <Loader2Icon className="size-10 text-primary animate-spin" />}
      </div>
      <div className="w-full max-w-xs space-y-2">
        <Progress value={progress} />
        <p className="text-sm text-center text-muted-foreground">
          {statusMessage}
        </p>
        {extra}
      </div>
    </div>
  );
}

interface ImportErrorStateProps {
  error: string | null;
  defaultError: string;
  onRetry: () => void;
  retryText?: string;
}

export function ImportErrorState({
  error,
  defaultError,
  onRetry,
  retryText = "Try Again",
}: ImportErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-6">
      <div className="size-20 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircleIcon className="size-10 text-destructive" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground max-w-sm">
          {error || defaultError}
        </p>
      </div>
      <Button onClick={onRetry} variant="outline" className="gap-2">
        {retryText}
      </Button>
    </div>
  );
}

interface ImportEmptyStateProps {
  message: string;
  onRetry: () => void;
  retryText?: string;
}

export function ImportEmptyState({
  message,
  onRetry,
  retryText = "Try Again",
}: ImportEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-6">
      <div className="size-20 rounded-full bg-muted flex items-center justify-center">
        <AlertCircleIcon className="size-10 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      </div>
      <Button onClick={onRetry} variant="outline" className="gap-2">
        {retryText}
      </Button>
    </div>
  );
}

interface ImportDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ImportDialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: ImportDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">{children}</div>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

interface ImportDialogFooterProps {
  selectedCount: number;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function ImportDialogFooter({
  selectedCount,
  isSaving,
  onCancel,
  onSave,
}: ImportDialogFooterProps) {
  return (
    <>
      <Button variant="outline" onClick={onCancel} disabled={isSaving}>
        Cancel
      </Button>
      <Button
        onClick={onSave}
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
            Import {selectedCount} {selectedCount === 1 ? "Memory" : "Memories"}
          </>
        )}
      </Button>
    </>
  );
}
