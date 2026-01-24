import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { MemoryEntry } from "@superfill/shared/types/memory";
import type { AISettings, UISettings } from "@superfill/shared/types/settings";
import {
  type IStorageAdapter,
  type Settings,
  StorageCorruptionError,
  StorageError,
  StoragePermissionError,
} from "./adapter";

/**
 * File-based storage adapter using Node.js fs module
 * Used by the desktop app to store data in ~/.config/superfill/
 *
 * Storage location:
 * - Linux/macOS: ~/.config/superfill/
 * - Windows: %APPDATA%\superfill\
 */
export class FileStorageAdapter implements IStorageAdapter {
  private basePath: string;
  private memoriesPath: string;
  private settingsPath: string;
  private sessionCache = new Map<string, unknown>();

  constructor(basePath?: string) {
    // Default to platform-specific config directory
    this.basePath =
      basePath ||
      path.join(
        process.platform === "win32"
          ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
          : path.join(os.homedir(), ".config"),
        "superfill",
      );

    this.memoriesPath = path.join(this.basePath, "memories.json");
    this.settingsPath = path.join(this.basePath, "settings.json");
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to create storage directory: ${this.basePath}`,
      );
    }
  }

  async getMemories(): Promise<MemoryEntry[]> {
    try {
      const data = await fs.readFile(this.memoriesPath, "utf-8");
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return []; // File doesn't exist yet, return empty array
      }
      throw new StorageCorruptionError("memories", error);
    }
  }

  async saveMemories(memories: MemoryEntry[]): Promise<void> {
    try {
      await this.initialize();
      await fs.writeFile(
        this.memoriesPath,
        JSON.stringify(memories, null, 2),
        "utf-8",
      );
    } catch (error) {
      throw new StorageError(
        "Failed to save memories to file",
        "SAVE_FAILED",
        error,
      );
    }
  }

  async addMemory(memory: MemoryEntry): Promise<void> {
    const memories = await this.getMemories();
    memories.push(memory);
    await this.saveMemories(memories);
  }

  async updateMemory(id: string, update: Partial<MemoryEntry>): Promise<void> {
    const memories = await this.getMemories();
    const index = memories.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new StorageError(`Memory not found: ${id}`, "NOT_FOUND");
    }
    memories[index] = { ...memories[index], ...update };
    await this.saveMemories(memories);
  }

  async deleteMemory(id: string): Promise<void> {
    const memories = await this.getMemories();
    const filtered = memories.filter((m) => m.id !== id);
    await this.saveMemories(filtered);
  }

  async getSettings(): Promise<{ ai: AISettings; ui: UISettings }> {
    try {
      const data = await fs.readFile(this.settingsPath, "utf-8");
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return this.getDefaultSettings();
      }
      throw new StorageCorruptionError("settings", error);
    }
  }

  async saveSettings(settings: {
    ai: AISettings;
    ui: UISettings;
  }): Promise<void> {
    try {
      await this.initialize();
      await fs.writeFile(
        this.settingsPath,
        JSON.stringify(settings, null, 2),
        "utf-8",
      );
    } catch (error) {
      throw new StorageError(
        "Failed to save settings to file",
        "SAVE_FAILED",
        error,
      );
    }
  }

  async updateSettings(partial: Partial<Settings>): Promise<void> {
    const settings = await this.getSettings();
    await this.saveSettings({ ...settings, ...partial });
  }

  async getSession(key: string): Promise<unknown> {
    return this.sessionCache.get(key);
  }

  async setSession(key: string, value: unknown): Promise<void> {
    this.sessionCache.set(key, value);
  }

  async clearSession(key: string): Promise<void> {
    this.sessionCache.delete(key);
  }

  async clear(): Promise<void> {
    try {
      await Promise.all([
        fs.unlink(this.memoriesPath).catch(() => {}),
        fs.unlink(this.settingsPath).catch(() => {}),
      ]);
      this.sessionCache.clear();
    } catch (error) {
      throw new StorageError("Failed to clear storage", "CLEAR_FAILED", error);
    }
  }

  async export(): Promise<{ memories: MemoryEntry[]; settings: Settings }> {
    const [memories, settings] = await Promise.all([
      this.getMemories(),
      this.getSettings(),
    ]);
    return { memories, settings };
  }

  async import(data: {
    memories?: MemoryEntry[];
    settings?: Partial<Settings>;
  }): Promise<void> {
    if (data.memories) {
      await this.saveMemories(data.memories);
    }
    if (data.settings) {
      await this.updateSettings(data.settings);
    }
  }

  private getDefaultSettings(): Settings {
    return {
      ai: {
        autoFillEnabled: true,
        autopilotMode: false,
        confidenceThreshold: 0.7,
        inlineTriggerEnabled: true,
        contextMenuEnabled: true,
      },
      ui: {
        theme: "system",
        onboardingCompleted: false,
      },
    };
  }

  /**
   * Watch for file changes (useful for syncing between extension and desktop app)
   */
  async watchMemories(
    callback: (memories: MemoryEntry[]) => void,
  ): Promise<() => void> {
    const watcher = fs.watch(this.memoriesPath);

    (async () => {
      try {
        for await (const event of watcher) {
          if (event.eventType === "change") {
            const memories = await this.getMemories();
            callback(memories);
          }
        }
      } catch {
        // Watcher was closed
      }
    })();

    return () => {
      // @ts-expect-error - watcher may have close method depending on Node version
      watcher.close?.();
    };
  }
}
