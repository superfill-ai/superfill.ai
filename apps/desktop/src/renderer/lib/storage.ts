/// <reference types="../../preload/index.d.ts" />

import type { MemoryEntry } from "@superfill/shared/types/memory";
import type { Settings } from "@superfill/storage/adapter";

export const storageClient = {
  // Memory operations
  async getMemories(): Promise<MemoryEntry[]> {
    return (await window.electron.invoke("storage:getMemories")) as MemoryEntry[];
  },

  async addMemory(memory: MemoryEntry): Promise<void> {
    await window.electron.invoke("storage:addMemory", memory);
  },

  async updateMemory(id: string, update: Partial<MemoryEntry>): Promise<void> {
    await window.electron.invoke("storage:updateMemory", id, update);
  },

  async deleteMemory(id: string): Promise<void> {
    await window.electron.invoke("storage:deleteMemory", id);
  },

  // Settings operations
  async getSettings(): Promise<Settings> {
    return (await window.electron.invoke("storage:getSettings")) as Settings;
  },

  async updateSettings(settings: Partial<Settings>): Promise<void> {
    await window.electron.invoke("storage:updateSettings", settings);
  },

  // Session operations
  async getSession<T = unknown>(key: string): Promise<T | undefined> {
    return (await window.electron.invoke("storage:getSession", key)) as T | undefined;
  },

  async setSession(key: string, value: unknown): Promise<void> {
    await window.electron.invoke("storage:setSession", key, value);
  },

  async clearSession(key: string): Promise<void> {
    await window.electron.invoke("storage:clearSession", key);
  },

  // Utility operations
  async export(): Promise<{ memories: MemoryEntry[]; settings: Settings }> {
    return (await window.electron.invoke("storage:export")) as {
      memories: MemoryEntry[];
      settings: Settings;
    };
  },

  async import(data: {
    memories?: MemoryEntry[];
    settings?: Partial<Settings>;
  }): Promise<void> {
    await window.electron.invoke("storage:import", data);
  },
};
