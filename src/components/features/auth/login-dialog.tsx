import type { Provider } from "@supabase/supabase-js";
import { FaGithub, FaGoogle, FaLinkedin } from "react-icons/fa";
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

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const { signIn, signingIn, selectedProvider } = useAuth();

  const handleLogin = async (provider: Provider) => {
    try {
      await signIn(provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Sign In</DialogTitle>
          <DialogDescription>
            Choose your preferred authentication provider
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleLogin("google")}
            disabled={signingIn}
          >
            {signingIn && selectedProvider === "google" ? (
              <Spinner className="size-4" />
            ) : (
              <FaGoogle className="size-4" />
            )}
            Continue with Google
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleLogin("github")}
            disabled={signingIn}
          >
            {signingIn && selectedProvider === "github" ? (
              <Spinner className="size-4" />
            ) : (
              <FaGithub className="size-4" />
            )}
            Continue with GitHub
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleLogin("linkedin_oidc")}
            disabled={signingIn}
          >
            {signingIn && selectedProvider === "linkedin_oidc" ? (
              <Spinner className="size-4" />
            ) : (
              <FaLinkedin className="size-4" />
            )}
            Continue with LinkedIn
          </Button>
        </div>
        {signingIn && (
          <p className="text-sm text-muted-foreground text-center">
            Opening authentication window...
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
