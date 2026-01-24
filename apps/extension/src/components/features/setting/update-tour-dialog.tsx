import { Button } from "@superfill/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@superfill/ui/dialog";

interface UpdateTourDialogProps {
  open: boolean;
  version: string;
  changes: string[];
  onDismiss: () => void;
  onStartTour: () => void;
}

export function UpdateTourDialog({
  open,
  version,
  changes,
  onDismiss,
  onStartTour,
}: UpdateTourDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🎉 What's New in v{version}
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-2">
            <p className="text-sm">
              We've added some exciting new features to superfill.ai:
            </p>
            <ul className="text-sm space-y-2 list-disc list-inside ml-2">
              {changes.map((change) => (
                <li key={change} className="text-foreground">
                  {change}
                </li>
              ))}
            </ul>
            <p className="text-sm">
              Would you like a quick tour of the new features?
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onDismiss}
            className="w-full sm:w-auto"
          >
            Okay
          </Button>
          <Button onClick={onStartTour} className="w-full sm:w-auto">
            Show Me the Tour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
