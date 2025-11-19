import { useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { LoginDialog } from "@/components/features/auth/login-dialog";
import { EntryForm } from "@/components/features/memory/entry-form";
import { EntryList } from "@/components/features/memory/entry-list";
import { AiProviderSettings } from "@/components/features/setting/ai-provider-settings";
import { AutofillSettings } from "@/components/features/setting/autofill-settings";
import { OnboardingDialog } from "@/components/features/setting/onboarding-dialog";
import { TriggerSettings } from "@/components/features/setting/trigger-settings";
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
import { APP_NAME } from "@/constants";
import { useMemories } from "@/hooks/use-memories";
import { useIsMobile } from "@/hooks/use-mobile";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/use-auth";

const logger = createLogger("options:App");

export const App = () => {
  const isMobile = useIsMobile();
  const { isAuthenticated, signOut, checkAuthStatus } = useAuth();
  const [activeTab, setActiveTab] = useState<"settings" | "memory">("settings");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { entries } = useMemories();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: not needed
  useEffect(() => {
    checkAuthStatus().catch(logger.error);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      logger.info("Signed out successfully");
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

      if (!uiSettings.onboardingCompleted) {
        setShowOnboarding(true);
      }
    };

    checkOnboarding();

    const unsubscribe = storage.uiSettings.watch((newSettings) => {
      if (newSettings?.onboardingCompleted) {
        setShowOnboarding(false);
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

  return (
    <section
      className="relative w-full h-screen flex flex-col overflow-hidden"
      aria-label="Options page"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-6" />
          <h1 className="text-xl font-bold text-primary">{APP_NAME}</h1>
        </div>
        <div className="flex items-center gap-2">
          {!isAuthenticated ? (
            <Button
              onClick={() => setLoginDialogOpen(true)}
              variant="outline"
              size="sm"
            >
              Sign in to sync
            </Button>
          ) : (
            <Button onClick={handleSignOut} variant="destructive" size="sm">
              Sign out
            </Button>
          )}
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
            <TabsTrigger value="settings">
              Settings
              <Kbd>s</Kbd>
            </TabsTrigger>
            <TabsTrigger value="memory">
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
              <AiProviderSettings />
              <TriggerSettings />
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
    </section>
  );
};
