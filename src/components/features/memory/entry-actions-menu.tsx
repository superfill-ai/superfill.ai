import { CopyIcon, Edit2Icon, MoreVerticalIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface EntryActionsMenuProps {
  id: string;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  triggerSize?: "icon-sm" | "icon";
  triggerClassName?: string;
}

export function EntryActionsMenu({
  id,
  onEdit,
  onDuplicate,
  onDelete,
  triggerSize = "icon-sm",
  triggerClassName,
}: EntryActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={triggerSize} className={triggerClassName}>
          <MoreVerticalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(id)}>
          <Edit2Icon className="mr-2 size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate(id)}>
          <CopyIcon className="mr-2 size-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete(id)}
          className="text-destructive"
        >
          <Trash2Icon className="mr-2 size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
