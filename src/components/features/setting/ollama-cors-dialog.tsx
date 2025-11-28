import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const detectOS = (): "macos" | "linux" | "windows" => {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes("mac")) {
    return "macos";
  }
  if (userAgent.includes("win")) {
    return "windows";
  }
  // Check Android before Linux since Android user agents contain "linux"
  if (userAgent.includes("android")) {
    return "linux";
  }
  if (userAgent.includes("linux")) {
    return "linux";
  }

  // Default to macOS if unable to detect
  return "macos";
};

export const OllamaCorsDialog = () => {
  const defaultOS = detectOS();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" size="xs" className="text-xs">
          CORS settings are properly configured
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuring CORS for Ollama</DialogTitle>
          <DialogDescription>
            To use Ollama with browser extensions, you need to configure CORS
            (Cross-Origin Resource Sharing) settings. Follow the instructions
            for your operating system below.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={defaultOS} className="max-w-md">
          <TabsList>
            <TabsTrigger value="macos">macOS</TabsTrigger>
            <TabsTrigger value="linux">Linux</TabsTrigger>
            <TabsTrigger value="windows">Windows</TabsTrigger>
          </TabsList>

          <TabsContent value="macos" className="text-sm">
            <p className="text-muted-foreground">
              If you're running Ollama as an application, use{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                launchctl
              </code>{" "}
              to set environment variables:
            </p>

            <div className="space-y-2">
              <p className="font-medium">For allowing all domains:</p>
              <pre className="bg-muted p-3 rounded-md overflow-x-auto">
                <code>launchctl setenv OLLAMA_ORIGINS "*"</code>
              </pre>
            </div>

            <div className="space-y-2">
              <p className="font-medium">For specific domains:</p>
              <pre className="bg-muted p-3 rounded-md overflow-x-auto">
                <code>
                  launchctl setenv OLLAMA_ORIGINS "google.com,linkedin.com"
                </code>
              </pre>
            </div>

            <p className="text-muted-foreground text-xs">
              After setting the environment variables, restart the Ollama
              application to apply the changes.
            </p>
          </TabsContent>

          <TabsContent value="linux" className="text-sm">
            <p className="text-muted-foreground">
              For Linux users running Ollama as a systemd service:
            </p>

            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>
                Open the service file in an editor:
                <pre className="bg-muted p-3 rounded-md overflow-x-auto mt-2">
                  <code>systemctl edit ollama.service</code>
                </pre>
              </li>
              <li className="mt-3">
                In the{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                  [Service]
                </code>{" "}
                section, add the Environment line:
                <div className="space-y-2 mt-2">
                  <p className="font-medium">For unrestricted access:</p>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto">
                    <code>
                      {`[Service]
Environment="OLLAMA_ORIGINS=*"`}
                    </code>
                  </pre>
                  <p className="font-medium">Or for specific domains:</p>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto">
                    <code>
                      {`[Service]
Environment="OLLAMA_ORIGINS=google.com,linkedin.com"`}
                    </code>
                  </pre>
                </div>
              </li>
              <li className="mt-3">
                Save changes, reload systemd, and restart Ollama:
                <pre className="bg-muted p-3 rounded-md overflow-x-auto mt-2">
                  <code>
                    {`systemctl daemon-reload
systemctl restart ollama`}
                  </code>
                </pre>
              </li>
            </ol>
          </TabsContent>

          <TabsContent value="windows" className="text-sm">
            <p className="text-muted-foreground">
              On Windows, configure environment variables through the Control
              Panel:
            </p>

            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Ensure Ollama is not running (quit from the taskbar)</li>
              <li>Open Control Panel → "Edit system environment variables"</li>
              <li>
                Create or edit a variable named{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                  OLLAMA_ORIGINS
                </code>
                :
                <div className="space-y-2 mt-2">
                  <p className="font-medium">To allow all domains:</p>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto">
                    <code>OLLAMA_ORIGINS=*</code>
                  </pre>
                  <p className="font-medium">Or for specific domains:</p>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto">
                    <code>OLLAMA_ORIGINS=google.com,linkedin.com</code>
                  </pre>
                </div>
              </li>
              <li>Apply changes and close the Control Panel</li>
              <li>
                Run Ollama from a new terminal window to ensure it picks up the
                updated environment variables
              </li>
            </ol>
          </TabsContent>
        </Tabs>

        {/* Important Note */}
        <div className="bg-muted/50 p-4 rounded-md border text-sm">
          <p className="font-medium mb-2">Important:</p>
          <p className="text-muted-foreground text-xs">
            Properly configured CORS settings ensure that Ollama can securely
            communicate with the browser extension. After making these changes,
            restart Ollama and test the connection using the "Test Connection"
            button.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
