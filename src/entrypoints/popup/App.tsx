import {
  SettingsIcon,
  SparklesIcon,
  TargetIcon,
  TrophyIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { EntryCard } from "@/components/features/memory/entry-card";
import { EntryForm } from "@/components/features/memory/entry-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { APP_NAME } from "@/constants";
import {
  useMemories,
  useMemoryMutations,
  useMemoryStats,
  useTopMemories,
} from "@/hooks/use-memories";
import { getAutofillService } from "@/lib/autofill/autofill-service";
import {
  ERROR_MESSAGE_API_KEY_NOT_CONFIGURED,
  ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED,
} from "@/lib/errors";
import { createLogger, DEBUG } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import { keyVault } from "@/lib/security/key-vault";
import { storage } from "@/lib/storage";

const logger = createLogger("popup");

export const App = () => {
  const { entries, loading } = useMemories();
  const { deleteEntry } = useMemoryMutations();
  const [selectedModels, setSelectedModels] = useState<
    Partial<Record<AIProvider, string>>
  >({});
  const [selectedProvider, setSelectedProvider] = useState<
    AIProvider | undefined
  >();
  const stats = useMemoryStats();
  const topMemories = useTopMemories(10);
  const [activeTab, setActiveTab] = useState<
    "autofill" | "memories" | "add-memory"
  >("autofill");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const hasMemories = entries.length > 0;

  useEffect(() => {
    const checkOnboarding = async () => {
      const SKIP_ONBOARDING = import.meta.env.VITE_SKIP_ONBOARDING === "true";

      if (SKIP_ONBOARDING) {
        setOnboardingCompleted(true);
        return;
      }

      const uiSettings = await storage.uiSettings.getValue();
      setOnboardingCompleted(uiSettings.onboardingCompleted);
    };

    checkOnboarding();

    const unsubscribe = storage.uiSettings.watch((newSettings) => {
      if (newSettings) {
        setOnboardingCompleted(newSettings.onboardingCompleted);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const fetchAndWatch = async () => {
      const settings = await storage.aiSettings.getValue();
      setSelectedProvider(settings.selectedProvider);
      setSelectedModels(settings.selectedModels || {});
    };

    fetchAndWatch();

    const unsubscribe = storage.aiSettings.watch((newSettings) => {
      if (newSettings) {
        setSelectedProvider(newSettings.selectedProvider);
        setSelectedModels(newSettings.selectedModels || {});
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useHotkeys("c", () => {
    setActiveTab("add-memory");
    setTimeout(() => {
      const questionField = document.querySelector(
        'textarea[name="question"]',
      ) as HTMLTextAreaElement;
      questionField?.focus();
    }, 100);
  });

  useHotkeys("m", () => {
    setActiveTab("memories");
  });

  useHotkeys("a", () => {
    if (hasMemories) {
      setActiveTab("autofill");
    }
  });

  const handleOpenSettings = () => {
    browser.runtime.openOptionsPage();
  };

  useHotkeys("s", () => {
    handleOpenSettings();
  });

  const handleAutofill = async () => {
    try {
      if (!selectedProvider) {
        toast.error(ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED, {
          description:
            "Please configure an AI provider in settings to use autofill",
          action: {
            label: "Open Settings",
            onClick: () => browser.runtime.openOptionsPage(),
          },
          dismissible: true,
        });
        return;
      }
      const apiKey = await keyVault.getKey(selectedProvider);

      if (!apiKey || apiKey.trim() === "") {
        toast.error(ERROR_MESSAGE_API_KEY_NOT_CONFIGURED, {
          description:
            "Please configure an API key in settings to use autofill",
          action: {
            label: "Open Settings",
            onClick: () => browser.runtime.openOptionsPage(),
          },
          dismissible: true,
        });
        return;
      }

      toast.info("Starting autofill... This window will close shortly.");

      const autofillService = getAutofillService();
      autofillService.startAutofillOnActiveTab(apiKey || undefined);

      if (!DEBUG) {
        setTimeout(() => {
          window.close();
        }, 600);
      }
    } catch (error) {
      logger.error("Autofill error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start autofill",
      );
    }
  };

  const handleFormSuccess = () => {
    if (editingEntryId) {
      setEditingEntryId(null);
      setActiveTab("memories");
    } else if (entries.length === 1) {
      setActiveTab("autofill");
    }
  };

  const handleEdit = (entryId: string) => {
    setEditingEntryId(entryId);
    setActiveTab("add-memory");
  };

  const handleDelete = async (entryId: string) => {
    try {
      await deleteEntry.mutateAsync(entryId);
      toast.success("Memory deleted successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete memory",
      );
    }
  };

  const handleDuplicate = (entryId: string) => {
    const entryToDuplicate = entries.find((e) => e.id === entryId);
    if (entryToDuplicate) {
      setEditingEntryId(entryToDuplicate.id);
      setActiveTab("add-memory");
    }
  };

  const handleCancelEdit = () => {
    setEditingEntryId(null);
  };

  if (loading) {
    return (
      <section
        className="relative w-full h-[600px] flex items-center justify-center"
        aria-label="Loading"
      >
        <div className="flex flex-col items-center gap-4">
          <img src="/favicon.svg" alt="" className="size-6" />
          <p className="text-sm text-muted-foreground">Loading memories...</p>
        </div>
      </section>
    );
  }

  if (!onboardingCompleted) {
    return (
      <section
        className="relative w-full h-[600px] flex items-center justify-center p-6"
        aria-label="Onboarding required"
      >
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon className="size-5" />
              Welcome to {APP_NAME}!
            </CardTitle>
            <CardDescription>
              Please complete the initial setup to get started with autofilling
              forms.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="default"
              className="w-full"
              onClick={handleOpenSettings}
            >
              Complete Setup
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section
      className="relative w-full h-[600px] flex flex-col overflow-hidden"
      aria-label="App content"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-6" />
          <h1 className="text-lg font-bold text-primary">{APP_NAME}</h1>
        </div>
        <div className="flex gap-1 items-center">
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenSettings}
                aria-label="Open settings"
              >
                <SettingsIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Settings <Kbd>S</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as typeof activeTab)}
          className="h-full flex flex-col gap-0"
        >
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="autofill" disabled={!hasMemories}>
              Autofill <Kbd>a</Kbd>
            </TabsTrigger>
            <TabsTrigger value="add-memory">
              Add Memory <Kbd>c</Kbd>
            </TabsTrigger>
            <TabsTrigger value="memories">
              Memories <Kbd>m</Kbd>
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="autofill"
            className="overflow-auto space-y-4 p-2 flex flex-col"
          >
            <div className="flex-1 flex items-center justify-center">
              <Button
                variant="shine"
                className="w-full flex gap-2"
                disabled={!hasMemories}
                onClick={handleAutofill}
              >
                <SparklesIcon className="size-4" />
                Autofill with AI
              </Button>
            </div>

            <Card className="gap-2">
              <CardHeader>
                <CardTitle>Ready to Autofill</CardTitle>
                <CardDescription>
                  Click the button above to intelligently fill form fields on
                  this page using your stored memories.
                </CardDescription>
              </CardHeader>
              {selectedProvider && (
                <CardFooter>
                  <span className="text-muted-foreground text-xs underline">
                    Selected model: {selectedModels[selectedProvider] || "N/A"}{" "}
                    of {selectedProvider}
                  </span>
                </CardFooter>
              )}
            </Card>

            <Card>
              <CardContent className="space-y-2">
                <CardTitle className="flex items-center gap-2">
                  <TrophyIcon className="size-4" />
                  Quick Stats
                </CardTitle>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    📝 memories stored
                  </span>
                  <Badge variant="secondary">{stats.memoryCount}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    🎯 successful autofills
                  </span>
                  <Badge variant="secondary">{stats.totalAutofills}</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="add-memory"
            className="flex-1 overflow-auto space-y-4 p-2"
          >
            <Item className="p-0">
              <ItemContent>
                <ItemTitle>
                  {editingEntryId ? "Edit Memory" : "Add New Memory"}
                </ItemTitle>
                <ItemDescription className="text-nowrap">
                  {editingEntryId
                    ? "Update your memory entry below"
                    : "Store information that you want to use for auto-filling forms"}
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item className="p-0">
              <ItemContent>
                <EntryForm
                  layout="compact"
                  mode={editingEntryId ? "edit" : "create"}
                  initialData={
                    editingEntryId
                      ? entries.find((e) => e.id === editingEntryId)
                      : undefined
                  }
                  onSuccess={handleFormSuccess}
                  onCancel={editingEntryId ? handleCancelEdit : undefined}
                />
              </ItemContent>
            </Item>
          </TabsContent>

          <TabsContent
            value="memories"
            className="flex-1 overflow-auto space-y-2 p-2"
          >
            {topMemories.length === 0 ? (
              <Empty className="h-full w-full flex items-center justify-center">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SparklesIcon />
                  </EmptyMedia>
                  <EmptyTitle>No memories yet</EmptyTitle>
                  <EmptyDescription>
                    Create your first memory entry in the "Add Memory" tab to
                    get started
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <Item className="p-0">
                  <ItemContent>
                    <ItemTitle className="flex items-center">
                      <TargetIcon className="size-4" />
                      Top 10 Most Used Memories
                    </ItemTitle>
                    <ItemDescription>
                      Your most frequently used memory entries
                    </ItemDescription>
                  </ItemContent>
                </Item>
                <Item className="p-0">
                  <ItemContent>
                    {topMemories.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        mode="compact"
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onDuplicate={handleDuplicate}
                      />
                    ))}
                  </ItemContent>
                </Item>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </section>
  );
};
