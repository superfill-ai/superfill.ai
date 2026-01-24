import type { MemoryEntry } from "@superfill/shared/types/memory";
import { Badge } from "@superfill/ui/badge";
import { Button } from "@superfill/ui/button";
import { Card, CardContent, CardHeader } from "@superfill/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@superfill/ui/dropdown-menu";
import { Input } from "@superfill/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superfill/ui/select";
import { Spinner } from "@superfill/ui/spinner";
import {
  EditIcon,
  MoreVerticalIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMemories, useMemoryMutations } from "../hooks/use-memories";

type SortOption = "recent" | "alphabetical";

interface MemoryListWrapperProps {
  onEdit: (entryId: string) => void;
  onAdd: () => void;
}

function EntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: MemoryEntry;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1 space-y-1">
          {entry.question && (
            <p className="text-sm font-medium text-muted-foreground">
              {entry.question}
            </p>
          )}
          <p className="text-base">{entry.answer}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVerticalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <EditIcon className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <TrashIcon className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="outline">{entry.category}</Badge>
          {entry.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(entry.metadata.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function MemoryListWrapper({ onEdit, onAdd }: MemoryListWrapperProps) {
  const { entries, loading } = useMemories();
  const { deleteEntry } = useMemoryMutations();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");

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

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this memory?")) {
      try {
        await deleteEntry.mutateAsync(id);
        toast.success("Memory deleted successfully");
      } catch (error) {
        console.error("Failed to delete memory:", error);
        toast.error("Failed to delete memory");
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40">
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
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="alphabetical">Alphabetical</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={onAdd}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Memory
        </Button>
      </div>

      {filteredAndSortedEntries.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            {searchQuery || categoryFilter !== "all"
              ? "No memories found matching your filters"
              : "No memories yet. Add your first memory to get started."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredAndSortedEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={() => onEdit(entry.id)}
              onDelete={() => handleDelete(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
