import { Button } from "@superfill/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@superfill/ui/dialog";
import { SparklesIcon } from "lucide-react";
import { APP_NAME } from "@/constants";

interface WelcomeTourDialogProps {
  open: boolean;
  onExplore: () => void;
  onStartTour: () => void;
}

export function WelcomeTourDialog({
  open,
  onExplore,
  onStartTour,
}: WelcomeTourDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-primary" />
            Welcome to {APP_NAME}!
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-2">
            <p>
              <strong className="text-foreground">superfill.ai</strong> is your
              intelligent form-filling assistant that learns from your
              information and automatically completes forms across the web.
            </p>
            <p className="text-sm">
              <strong className="text-foreground">How it works:</strong>
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside ml-2">
              <li>Store your information as memories (questions & answers)</li>
              <li>Visit any website with forms</li>
              <li>AI analyzes the form and suggests relevant information</li>
              <li>Review and fill forms with one click</li>
            </ul>
            <p className="text-sm">
              Would you like a quick tour of the features, or explore on your
              own?
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onExplore}
            className="w-full sm:w-auto"
          >
            I'll Explore
          </Button>
          <Button onClick={onStartTour} className="w-full sm:w-auto">
            Show Me the Tour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
