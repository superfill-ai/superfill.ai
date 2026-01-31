import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";
import { DocumentImportDialog } from "@/components/features/document/document-import-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ProfileImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function ProfileImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: ProfileImportDialogProps) {
  const [showDocumentImport, setShowDocumentImport] = useState(false);

  const handleOpenDocumentImport = () => {
    setShowDocumentImport(true);
    onOpenChange(false);
  };

  const handleDocumentImportClose = (open: boolean) => {
    setShowDocumentImport(open);
    if (!open) {
      onOpenChange(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="overflow-y-auto max-h-[90vh] max-w-1/2">
          <DialogHeader>
            <DialogTitle>Import from LinkedIn</DialogTitle>
            <DialogDescription>
              Follow these steps to export your LinkedIn profile and import it
              into Superfill.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Steps */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">
                  Step 1: Open Your Profile
                </h3>
                <p className="text-sm text-muted-foreground">
                  Go to your LinkedIn profile page. You can click "Me" in the
                  top navigation bar, then "View profile".
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    window.open("https://www.linkedin.com/in/me", "_blank")
                  }
                >
                  <ExternalLinkIcon className="size-3" />
                  Open LinkedIn Profile
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">
                  Step 2: Access More Menu
                </h3>
                <p className="text-sm text-muted-foreground">
                  Click the "Resources" (prev "More" or "...") button in your
                  profile's intro section.
                </p>
                {/* Placeholder for screenshot */}
                <div className="bg-muted/50 rounded-md border-2 border-dashed p-0.5 w-fit mx-auto">
                  <img
                    src="/linkedin-resources.webp"
                    alt="LinkedIn More Menu"
                    className="rounded-sm max-w-108"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Step 3: Save to PDF</h3>
                <p className="text-sm text-muted-foreground">
                  Select "Save to PDF" from the dropdown menu. LinkedIn will
                  generate a PDF version of your profile.
                </p>
                {/* Placeholder for screenshot */}
                <div className="bg-muted/50 rounded-md border-2 border-dashed p-0.5 w-fit mx-auto">
                  <img
                    src="/linkedin-save-to-pdf.webp"
                    alt="LinkedIn Save to PDF"
                    className="rounded-sm max-h-60"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">
                  Step 4: Download the PDF
                </h3>
                <p className="text-sm text-muted-foreground">
                  Your browser will download a PDF file named something like
                  "Profile.pdf" or "YourName.pdf". Save it to your computer.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">
                  Step 5: Import to Superfill
                </h3>
                <p className="text-sm text-muted-foreground">
                  Click the button below to open the document import dialog and
                  upload your LinkedIn PDF. Superfill will extract all your
                  professional information automatically.
                </p>
                <Button className="gap-2" onClick={handleOpenDocumentImport}>
                  <FileTextIcon className="size-4" />
                  Import PDF Document
                </Button>
              </div>
            </div>

            {/* Why this method */}
            <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-md border border-blue-200 dark:border-blue-800 space-y-2">
              <p className="font-medium text-sm text-blue-900 dark:text-blue-100">
                Why we use this method
              </p>
              <p className="text-xs text-blue-800 dark:text-blue-200">
                LinkedIn's Terms of Service prohibit automated scraping. By
                using their official "Save to PDF" feature, you're exporting
                your own data in a way that respects their policies and keeps
                your account safe.
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentImportDialog
        open={showDocumentImport}
        onOpenChange={handleDocumentImportClose}
        onSuccess={onSuccess}
      />
    </>
  );
}
