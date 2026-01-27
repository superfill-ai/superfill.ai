import { CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { LoginDialog } from "@/components/features/auth/login-dialog";
import { EntryForm } from "@/components/features/memory/entry-form";
import { EntryList } from "@/components/features/memory/entry-list";
import { AiProviderSettings } from "@/components/features/setting/ai-provider-settings";
import { AutofillSettings } from "@/components/features/setting/autofill-settings";
import { CaptureSettings } from "@/components/features/setting/capture-settings";
import { OnboardingDialog } from "@/components/features/setting/onboarding-dialog";
import { UpdateTourDialog } from "@/components/features/setting/update-tour-dialog";
import { WelcomeTourDialog } from "@/components/features/setting/welcome-tour-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { APP_NAME } from "@/constants";
import { useAuth } from "@/hooks/use-auth";
import { useMemories } from "@/hooks/use-memories";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSync } from "@/hooks/use-sync";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { getCurrentAppTour } from "@/lib/tours/tour-definitions";
import { tourManager } from "@/lib/tours/tour-manager";
import { getUpdateForVersion } from "@/lib/tours/version-updates";

const logger = createLogger("options:App");

export const App = () => {
  const isMobile = useIsMobile();
  const { isAuthenticated, loading, signOut, checkAuthStatus } = useAuth();
  const { syncing, canSync, timeUntilNextSync, syncStatus, performSync } =
    useSync();
  const [activeTab, setActiveTab] = useState<"settings" | "memory">("settings");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { entries } = useMemories();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [showUpdateTour, setShowUpdateTour] = useState(false);
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateChanges, setUpdateChanges] = useState<string[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: not needed
  useEffect(() => {
    checkAuthStatus().catch(logger.error);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      logger.debug("Signed out successfully");
    } catch (error) {
      logger.error("Sign-out failed", error);
    }
  };

  useEffect(() => {
    const checkOnboarding = async () => {
      const SKIP_ONBOARDING = import.meta.env.VITE_SKIP_ONBOARDING === "true";

      if (SKIP_ONBOARDING) {
        return;
      }

      const uiSettings = await storage.uiSettings.getValue();
      const storedMemories = await storage.memories.getValue();
      const manifest = browser.runtime.getManifest();
      const currentVersion = manifest.version;

      if (!uiSettings.onboardingCompleted && storedMemories.length === 0) {
        setShowOnboarding(true);
      } else {
        const previousVersion = uiSettings.extensionVersion || "0.0.0";
        const shouldUpdateVersion = previousVersion !== currentVersion;

        if (shouldUpdateVersion && previousVersion !== "0.0.0") {
          const updateInfo = getUpdateForVersion(currentVersion);

          if (updateInfo) {
            setUpdateVersion(currentVersion);
            setUpdateChanges(updateInfo.changes);
            setShowUpdateTour(true);
            setActiveTab("settings");
          }
        }

        await storage.uiSettings.setValue({
          ...uiSettings,
          onboardingCompleted: true,
          extensionVersion: currentVersion,
        });
      }
    };

    checkOnboarding();

    const unsubscribe = storage.uiSettings.watch((newSettings, oldSettings) => {
      if (
        newSettings?.onboardingCompleted &&
        !oldSettings?.onboardingCompleted
      ) {
        setShowOnboarding(false);
        setShowWelcomeTour(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useHotkeys("c", () => {
    setActiveTab("memory");
    setTimeout(() => {
      const questionField = document.querySelector(
        'textarea[name="question"]',
      ) as HTMLTextAreaElement;
      questionField?.focus();
    }, 100);
  });

  useHotkeys("m", () => {
    setActiveTab("memory");
  });

  useHotkeys("s", () => {
    setActiveTab("settings");
  });

  const handleEdit = (entryId: string) => {
    setEditingEntryId(entryId);
  };

  const handleDelete = () => {
    setEditingEntryId(null);
  };

  const handleDuplicate = (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (entry) {
      setEditingEntryId(entryId);
    }
  };

  const handleFormSuccess = () => {
    setEditingEntryId(null);
  };

  const handleCancelEdit = () => {
    setEditingEntryId(null);
  };

  const handleSync = async () => {
    if (!isAuthenticated) {
      setLoginDialogOpen(true);
      return;
    }

    const result = await performSync();
    if (result) {
      logger.debug("Manual sync completed", result);
    }
  };

  const formatTimeRemaining = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getSyncButtonText = () => {
    if (syncing) return "Syncing...";
    if (!canSync && timeUntilNextSync > 0) {
      return `Wait ${formatTimeRemaining(timeUntilNextSync)} for next sync`;
    }
    if (syncStatus === "synced") return "Sync";
    if (syncStatus === "error") return "Retry Sync";
    return "Sync";
  };

  const handleExploreApp = () => {
    setShowWelcomeTour(false);
  };

  const handleStartTour = () => {
    setShowWelcomeTour(false);
    const manifest = browser.runtime.getManifest();
    const currentVersion = manifest.version;
    const currentTour = getCurrentAppTour(currentVersion);
    const tour = tourManager.createTour(currentTour.id, currentTour.steps);
    tour.drive();
  };

  const handleDismissUpdate = () => {
    setShowUpdateTour(false);
  };

  const handleStartUpdateTour = () => {
    setShowUpdateTour(false);
    const updateInfo = getUpdateForVersion(updateVersion);
    if (updateInfo) {
      const tour = tourManager.createTour(updateInfo.tourId, updateInfo.steps);
      tour.drive();
    }
  };

  const handleManualTourTrigger = () => {
    const manifest = browser.runtime.getManifest();
    const currentVersion = manifest.version;
    const currentTour = getCurrentAppTour(currentVersion);
    const tour = tourManager.createTour(currentTour.id, currentTour.steps);
    tour.drive();
  };

  const handleVersionBadgeClick = () => {
    const manifest = browser.runtime.getManifest();
    const currentVersion = manifest.version;
    const updateInfo = getUpdateForVersion(currentVersion);

    if (updateInfo) {
      setUpdateVersion(currentVersion);
      setUpdateChanges(updateInfo.changes);
      setShowUpdateTour(true);
    }
  };

  return (
    <section
      className="relative w-full h-screen flex flex-col overflow-hidden"
      aria-label="Options page"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-6" />
            <h1 className="text-xl font-bold text-primary">{APP_NAME}</h1>
          </div>
          <Badge
            size="sm"
            variant="outline"
            className="text-xs text-muted-foreground cursor-pointer hover:bg-accent transition-colors"
            onClick={handleVersionBadgeClick}
          >
            v{browser.runtime.getManifest().version}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {!isAuthenticated ? (
            <Button
              onClick={() => setLoginDialogOpen(true)}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? "Loading auth..." : "Sign in"}
            </Button>
          ) : (
            <>
              <Button
                onClick={handleSync}
                variant={syncStatus === "error" ? "destructive" : "outline"}
                size="sm"
                disabled={syncing || !canSync}
              >
                {getSyncButtonText()}
              </Button>
              <Button onClick={handleSignOut} variant="ghost" size="sm">
                Sign out
              </Button>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleManualTourTrigger}
                aria-label="Show guided tour"
              >
                <CircleHelp className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show Tour</TooltipContent>
          </Tooltip>
          <ThemeToggle />
        </div>
      </header>

      <LoginDialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen} />

      <main className="flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as typeof activeTab)}
          className="h-full flex flex-col gap-0"
        >
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="settings" data-tour="settings-tab">
              Settings
              <Kbd>s</Kbd>
            </TabsTrigger>
            <TabsTrigger value="memory" data-tour="memory-tab">
              Memory
              <KbdGroup>
                <Kbd>m</Kbd> or
                <Kbd>c</Kbd>
              </KbdGroup>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="flex-1 overflow-auto p-6">
            <div className="max-w-3xl mx-auto space-y-6">
              <AutofillSettings />
              <CaptureSettings />
              <AiProviderSettings />
            </div>
          </TabsContent>

          <TabsContent value="memory" className="flex-1 overflow-hidden p-0">
            <ResizablePanelGroup
              direction={isMobile ? "vertical" : "horizontal"}
              className="h-full"
            >
              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full overflow-auto p-4">
                  <EntryList
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full overflow-auto p-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {editingEntryId ? "Edit Memory" : "Add New Memory"}
                      </CardTitle>
                      <CardDescription>
                        {editingEntryId
                          ? "Update an existing memory entry"
                          : "Create a new memory entry"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <EntryForm
                        mode={editingEntryId ? "edit" : "create"}
                        initialData={
                          editingEntryId
                            ? entries.find((e) => e.id === editingEntryId)
                            : undefined
                        }
                        onSuccess={handleFormSuccess}
                        onCancel={editingEntryId ? handleCancelEdit : undefined}
                      />
                    </CardContent>
                  </Card>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </TabsContent>
        </Tabs>
      </main>

      <OnboardingDialog open={showOnboarding} />
      <WelcomeTourDialog
        open={showWelcomeTour}
        onExplore={handleExploreApp}
        onStartTour={handleStartTour}
      />
      <UpdateTourDialog
        open={showUpdateTour}
        version={updateVersion}
        changes={updateChanges}
        onDismiss={handleDismissUpdate}
        onStartTour={handleStartUpdateTour}
      />
    </section>
  );
};
