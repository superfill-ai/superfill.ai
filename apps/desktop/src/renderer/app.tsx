import { Toaster } from "@superfill/ui/sonner";
import { useState } from "react";
import { MemoryListWrapper } from "./components/memory-list-wrapper";
import { ThemeProvider } from "./components/theme-provider-wrapper";

export function App() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container flex h-16 items-center px-4">
            <h1 className="text-xl font-semibold">Superfill Desktop</h1>
          </div>
        </header>
        <main className="container p-4">
          <MemoryListWrapper
            onEdit={(id) => setEditingId(id)}
            onAdd={() => setShowAddDialog(true)}
          />
        </main>
      </div>
      <Toaster />
    </ThemeProvider>
  );
}
