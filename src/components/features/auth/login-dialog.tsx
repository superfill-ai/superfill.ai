import { ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { createLogger } from "@/lib/logger";

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const logger = createLogger("login-dialog");

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const { signIn, signingIn, pendingApproval, inactiveMessage } = useAuth();

  const handleLogin = async () => {
    try {
      await signIn();
      onOpenChange(false);
    } catch (error) {
      logger.error("Login failed:", error);
    }
  };

  const preventClose = (event: Event) => {
    event.preventDefault();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={preventClose}
        onPointerDownOutside={preventClose}
        onInteractOutside={preventClose}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">Sign In</DialogTitle>
          <DialogDescription>
            Sign in to sync your memories across devices and access cloud
            features
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {pendingApproval && (
            <Alert>
              <AlertTitle>Account pending approval</AlertTitle>
              <AlertDescription>
                {inactiveMessage ??
                  "Cloud and sync features are disabled until your account is approved."}
              </AlertDescription>
            </Alert>
          )}

          <Button
            variant="default"
            className="w-full"
            onClick={handleLogin}
            disabled={signingIn}
          >
            {signingIn ? (
              <>
                <Spinner className="size-4" />
                Checking for authentication...
              </>
            ) : (
              <>
                <ExternalLink className="size-4" />
                Open Login Page
              </>
            )}
          </Button>
        </div>
        {signingIn && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="text-center">
              A new tab will open for authentication.
            </p>
            <p className="text-center">
              After logging in, return here and this dialog will automatically
              close.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
