import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { EntryForm } from "@/components/features/memory/entry-form";
import { EntryList } from "@/components/features/memory/entry-list";
import { AiProviderSettings } from "@/components/features/setting/ai-provider-settings";
import { AutofillSettings } from "@/components/features/setting/autofill-settings";
import { TriggerSettings } from "@/components/features/setting/trigger-settings";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { useMemoriesStore } from "@/lib/stores/memories";

export const App = () => {
  const isMobile = useIsMobile();
  const entries = useMemoriesStore((state) => state.entries);
  const [activeTab, setActiveTab] = useState<"settings" | "memory">("settings");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

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
        <ThemeToggle />
      </header>

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
    </section>
  );
};
