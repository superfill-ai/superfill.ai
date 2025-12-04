import { formatDistanceToNow } from "date-fns";
import {
  CheckIcon,
  CopyIcon,
  Edit2Icon,
  MoreVerticalIcon,
  Trash2Icon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";
import type { MemoryEntry } from "@/types/memory";

interface EntryCardProps {
  entry: MemoryEntry;
  mode: "compact" | "detailed";
  onEdit: (entryId: string) => void;
  onDelete: (entryId: string) => void;
  onDuplicate: (entryId: string) => void;
}

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.8) return "bg-green-500";
  if (confidence >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
};

const truncateText = (text: string, lines = 2) => {
  const maxLength = lines === 1 ? 50 : 100;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

export function EntryCard({
  entry,
  mode,
  onEdit,
  onDelete,
  onDuplicate,
}: EntryCardProps) {
  const [copied, setCopied] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useHotkeys(
    "e",
    () => {
      if (isHovered) {
        onEdit(entry.id);
      }
    },
    {
      enabled: isHovered,
      enableOnFormTags: false,
    },
    [isHovered, entry.id, onEdit],
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(entry.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shouldTruncateAnswer = entry.answer.length > 100;
  const displayAnswer = shouldTruncateAnswer
    ? truncateText(entry.answer, 2)
    : entry.answer;

  if (mode === "compact") {
    return (
      <Card
        ref={cardRef}
        className={cn(
          "hover:shadow-md transition-shadow gap-1",
          isHovered && "ring-2 ring-primary/50",
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CardHeader className="py-0 my-0">
          {entry.question && (
            <CardTitle className="truncate w-4/5">{entry.question}</CardTitle>
          )}
          <CardAction className="flex gap-1 items-center">
            <div
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                getConfidenceColor(entry.confidence),
              )}
              title={`Confidence: ${Math.round(entry.confidence * 100)}%`}
            />
            <Button variant="ghost" size="icon-sm" onClick={handleCopy}>
              {copied ? (
                <CheckIcon className="size-4" />
              ) : (
                <CopyIcon className="size-4" />
              )}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-2 py-0 my-0">
          {shouldTruncateAnswer ? (
            <HoverCard>
              <HoverCardTrigger asChild>
                <CardDescription className="text-sm text-muted-foreground line-clamp-2 cursor-pointer">
                  {entry.answer}
                </CardDescription>
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                {entry.answer}
              </HoverCardContent>
            </HoverCard>
          ) : (
            <CardDescription className="text-sm text-muted-foreground line-clamp-2">
              {entry.answer}
            </CardDescription>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="text-xs">{entry.category}</Badge>
            {entry.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {entry.tags.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{entry.tags.length - 2}
              </Badge>
            )}
          </div>
        </CardContent>

        <CardFooter className="justify-between py-0 my-0">
          <div className="flex items-center gap-2 ml-auto">
            {isHovered && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Kbd>e</Kbd> to edit
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  <MoreVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(entry.id)}>
                  <Edit2Icon className="mr-2 size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(entry.id)}>
                  <CopyIcon className="mr-2 size-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(entry.id)}
                  className="text-destructive"
                >
                  <Trash2Icon className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card
      ref={cardRef}
      className={cn(
        "p-4 gap-4 hover:shadow-md transition-shadow",
        isHovered && "ring-2 ring-primary/50",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {entry.question && (
                <h3 className="font-medium text-base mb-2">{entry.question}</h3>
              )}
              <div className="text-sm text-foreground">
                {shouldTruncateAnswer ? (
                  <>
                    <p className="whitespace-pre-wrap wrap-break-word">
                      {displayAnswer}
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs mt-1"
                      onClick={() => setShowFullContent(true)}
                    >
                      View full content
                    </Button>
                  </>
                ) : (
                  <p className="whitespace-pre-wrap wrap-break-word">
                    {entry.answer}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  getConfidenceColor(entry.confidence),
                )}
                title={`Confidence: ${Math.round(entry.confidence * 100)}%`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{entry.category}</Badge>
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-4">
              <span>
                Created{" "}
                {formatDistanceToNow(new Date(entry.metadata.createdAt), {
                  addSuffix: true,
                })}
              </span>
              {entry.metadata.createdAt !== entry.metadata.updatedAt && (
                <span>
                  Updated{" "}
                  {formatDistanceToNow(new Date(entry.metadata.updatedAt), {
                    addSuffix: true,
                  })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isHovered && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Kbd>e</Kbd> to edit
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreVerticalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(entry.id)}>
                    <Edit2Icon className="mr-2 size-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(entry.id)}>
                    <CopyIcon className="mr-2 size-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(entry.id)}
                    className="text-destructive"
                  >
                    <Trash2Icon className="mr-2 size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showFullContent} onOpenChange={setShowFullContent}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{entry.question || "Full Content"}</DialogTitle>
            <DialogDescription>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary">{entry.category}</Badge>
                {entry.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <p className="whitespace-pre-wrap wrap-break-word text-sm">
              {entry.answer}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
