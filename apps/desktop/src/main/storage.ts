import type { MemoryEntry } from "@superfill/shared/types/memory";
import type { Settings } from "@superfill/storage/adapter";
import { FileStorageAdapter } from "@superfill/storage/file-adapter";
import { ipcMain } from "electron";

const storage = new FileStorageAdapter();

export async function initializeStorage(): Promise<void> {
  await storage.initialize();
}

// Memory operations
ipcMain.handle("storage:getMemories", async () => {
  return await storage.getMemories();
});

ipcMain.handle("storage:addMemory", async (_event, memory: MemoryEntry) => {
  await storage.addMemory(memory);
});

ipcMain.handle(
  "storage:updateMemory",
  async (_event, id: string, update: Partial<MemoryEntry>) => {
    await storage.updateMemory(id, update);
  },
);

ipcMain.handle("storage:deleteMemory", async (_event, id: string) => {
  await storage.deleteMemory(id);
});

// Settings operations
ipcMain.handle("storage:getSettings", async () => {
  return await storage.getSettings();
});

ipcMain.handle(
  "storage:updateSettings",
  async (_event, settings: Partial<Settings>) => {
    await storage.updateSettings(settings);
  },
);

// Session storage
ipcMain.handle("storage:getSession", async (_event, key: string) => {
  return await storage.getSession(key);
});

ipcMain.handle(
  "storage:setSession",
  async (_event, key: string, value: unknown) => {
    await storage.setSession(key, value);
  },
);

ipcMain.handle("storage:clearSession", async (_event, key: string) => {
  await storage.clearSession(key);
});

// Utility operations
ipcMain.handle("storage:export", async () => {
  return await storage.export();
});

ipcMain.handle(
  "storage:import",
  async (
    _event,
    data: { memories?: MemoryEntry[]; settings?: Partial<Settings> },
  ) => {
    await storage.import(data);
  },
);
