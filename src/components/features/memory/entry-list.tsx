import {
  DownloadIcon,
  FileSpreadsheetIcon,
  GridIcon,
  ListIcon,
  SearchIcon,
  UploadIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EntryCard } from "@/components/features/memory/entry-card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  csvUtils,
  useMemories,
  useMemoryMutations,
} from "@/hooks/use-memories";
import { readCSVFile } from "@/lib/csv";
import { createLogger } from "@/lib/logger";

const logger = createLogger("component:entry-list");

type SortOption = "recent" | "usage" | "alphabetical";
type ViewMode = "list" | "grid";

interface EntryListProps {
  onEdit: (entryId: string) => void;
  onDelete: (entryId: string) => void;
  onDuplicate: (entryId: string) => void;
}

export function EntryList({ onEdit, onDelete, onDuplicate }: EntryListProps) {
  const { entries, loading } = useMemories();
  const { deleteEntry, importFromCSV } = useMemoryMutations();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const categories = useMemo(
    () => [...new Set(entries.map((e) => e.category))],
    [entries],
  );

  const filteredAndSortedEntries = useMemo(() => {
    let filtered = entries;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (entry) =>
          entry.answer.toLowerCase().includes(query) ||
          entry.question?.toLowerCase().includes(query) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          entry.category.toLowerCase().includes(query),
      );
    }

    if (categoryFilter !== "all") {
      filtered = filtered.filter((entry) => entry.category === categoryFilter);
    }

    const sorted = [...filtered];
    switch (sortBy) {
      case "recent":
        sorted.sort(
          (a, b) =>
            new Date(b.metadata.updatedAt).getTime() -
            new Date(a.metadata.updatedAt).getTime(),
        );
        break;
      case "usage":
        sorted.sort((a, b) => b.metadata.usageCount - a.metadata.usageCount);
        break;
      case "alphabetical":
        sorted.sort((a, b) => {
          const aText = a.question || a.answer;
          const bText = b.question || b.answer;
          return aText.localeCompare(bText);
        });
        break;
    }

    return sorted;
  }, [entries, searchQuery, categoryFilter, sortBy]);

  const handleEdit = (entryId: string) => {
    onEdit(entryId);
  };

  const handleDelete = async (entryId: string) => {
    try {
      await deleteEntry.mutateAsync(entryId);
      onDelete(entryId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete entry",
      );
      logger.error("Failed to delete entry:", error);
    }
  };

  const handleDuplicate = (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);

    if (entry) {
      onDuplicate(entryId);
    }
  };

  const handleExport = async () => {
    try {
      await csvUtils.exportToCSV();
      toast.success("Memories exported successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export memories",
      );
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const csvContent = await readCSVFile(file);
      const count = await importFromCSV.mutateAsync(csvContent);
      toast.success(`Successfully imported ${count} memories!`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to import memories",
      );
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownloadTemplate = () => {
    try {
      csvUtils.downloadCSVTemplate();
      toast.success("Template downloaded successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download template",
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by question, answer, tags, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortOption)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="usage">Most Used</SelectItem>
              <SelectItem value="alphabetical">Alphabetical</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-1 border rounded-md">
            <ToggleGroup type="single">
              <ToggleGroupItem
                value="list"
                aria-label="List view"
                onClick={() => setViewMode("list")}
              >
                <ListIcon className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="grid"
                aria-label="Grid view"
                onClick={() => setViewMode("grid")}
              >
                <GridIcon className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      {filteredAndSortedEntries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>
              {searchQuery || categoryFilter !== "all"
                ? "No results found"
                : "No entries yet"}
            </EmptyTitle>
            <EmptyDescription>
              {searchQuery || categoryFilter !== "all"
                ? "Try adjusting your search or filters"
                : "Create your first memory entry to get started"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex-1 overflow-auto">
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-1">
              {filteredAndSortedEntries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  mode="compact"
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4 p-1">
              {filteredAndSortedEntries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  mode="detailed"
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-1">
        <span>
          Showing {filteredAndSortedEntries.length} of {entries.length} entries
        </span>

        <TooltipProvider>
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImport}
              className="hidden"
              aria-label="Import CSV file"
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExport}
                  disabled={entries.length === 0 || importing}
                >
                  <UploadIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Export all memories to CSV</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  <DownloadIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Import memories from CSV</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDownloadTemplate}
                  disabled={importing}
                >
                  <FileSpreadsheetIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download blank CSV template</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
