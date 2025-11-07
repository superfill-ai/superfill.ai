import { EntryCard } from "@/components/features/memory/entry-card";
import { EntryForm } from "@/components/features/memory/entry-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  useInitializeMemory,
  useMemoryStats,
  useTopMemories,
} from "@/hooks/use-memory";
import { getAutofillService } from "@/lib/autofill/autofill-service";
import { createLogger } from "@/lib/logger";
import { keyVault } from "@/lib/security/key-vault";
import { store } from "@/lib/storage";
import { useMemoryStore } from "@/stores/memory";
import {
  SettingsIcon,
  SparklesIcon,
  TargetIcon,
  TrophyIcon,
} from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

const logger = createLogger("popup");

export const App = () => {
  useInitializeMemory();
  const entries = useMemoryStore((state) => state.entries);
  const loading = useMemoryStore((state) => state.loading);
  const deleteEntry = useMemoryStore((state) => state.deleteEntry);
  const initialized = useMemoryStore((state) => state.initialized);
  const error = useMemoryStore((state) => state.error);
  const stats = useMemoryStats();
  const topMemories = useTopMemories(10);
  const [activeTab, setActiveTab] = useState<
    "autofill" | "memories" | "add-memory"
  >("autofill");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const hasMemories = entries.length > 0;

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
      const userSettings = await store.userSettings.getValue();
      const apiKey = await keyVault.getKey(userSettings.selectedProvider);

      if (!apiKey || apiKey.trim() === "") {
        toast.error("AI provider not configured", {
          description: "Please configure an AI provider in settings to use autofill",
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

      setTimeout(() => {
        window.close();
      }, 600);
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
    await deleteEntry(entryId);
    toast.warning("Memory deleted successfully");
  };

  const handleDuplicate = async (entryId: string) => {
    const entryToDuplicate = entries.find((e) => e.id === entryId);
    if (entryToDuplicate) {
      setEditingEntryId(entryToDuplicate.id);
      setActiveTab("add-memory");
    }
  };

  const handleCancelEdit = () => {
    setEditingEntryId(null);
  };

  if (!initialized && loading) {
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

  if (error && !initialized) {
    return (
      <section
        className="relative w-full h-[600px] flex items-center justify-center p-4"
        aria-label="Error"
      >
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Failed to Load</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => logger.info("Try Again clicked")}
              className="w-full"
            >
              Try Again
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

      {error && initialized && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

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

            <Card>
              <CardHeader>
                <CardTitle>Ready to Autofill</CardTitle>
                <CardDescription>
                  Click the button above to intelligently fill form fields on
                  this page using your stored memories.
                </CardDescription>
              </CardHeader>
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
                <ItemDescription>
                  {editingEntryId
                    ? "Update your memory entry below"
                    : "Store information that you want to use for auto-filling forms"}
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item className="p-0">
              <ItemContent>
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
