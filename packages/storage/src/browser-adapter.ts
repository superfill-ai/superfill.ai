import type { MemoryEntry } from "@superfill/shared/types/memory";
import type { AISettings, UISettings } from "@superfill/shared/types/settings";
import {
    type IStorageAdapter,
    type Settings,
    StorageCorruptionError,
    StorageError,
} from "./adapter";

/**
 * Browser storage adapter using WXT storage API
 * Used by the browser extension to store data in browser's local storage
 */
export class BrowserStorageAdapter implements IStorageAdapter {
    private storage: {
        getItem: <T>(key: string) => Promise<T | null>;
        setItem: (key: string, value: unknown) => Promise<void>;
        removeItem: (key: string) => Promise<void>;
        clear?: () => Promise<void>;
    };

    constructor(storage: {
        getItem: <T>(key: string) => Promise<T | null>;
        setItem: (key: string, value: unknown) => Promise<void>;
        removeItem: (key: string) => Promise<void>;
        clear?: () => Promise<void>;
    }) {
        this.storage = storage;
    }

    async getMemories(): Promise<MemoryEntry[]> {
        try {
            const memories = await this.storage.getItem<MemoryEntry[]>("local:memories");
            return memories || [];
        } catch (error) {
            throw new StorageCorruptionError("memories", error);
        }
    }

    async saveMemories(memories: MemoryEntry[]): Promise<void> {
        try {
            await this.storage.setItem("local:memories", memories);
        } catch (error) {
            throw new StorageError("Failed to save memories", "SAVE_FAILED", error);
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
            const settings = await this.storage.getItem<Settings>("local:settings");
            return settings || this.getDefaultSettings();
        } catch (error) {
            throw new StorageCorruptionError("settings", error);
        }
    }

    async saveSettings(settings: { ai: AISettings; ui: UISettings }): Promise<void> {
        try {
            await this.storage.setItem("local:settings", settings);
        } catch (error) {
            throw new StorageError("Failed to save settings", "SAVE_FAILED", error);
        }
    }

    async updateSettings(partial: Partial<Settings>): Promise<void> {
        const settings = await this.getSettings();
        await this.saveSettings({ ...settings, ...partial });
    }

    async getSession(key: string): Promise<unknown> {
        try {
            return await this.storage.getItem(`session:${key}`);
        } catch (error) {
            throw new StorageCorruptionError(key, error);
        }
    }

    async setSession(key: string, value: unknown): Promise<void> {
        try {
            await this.storage.setItem(`session:${key}`, value);
        } catch (error) {
            throw new StorageError(
                `Failed to save session: ${key}`,
                "SAVE_FAILED",
                error,
            );
        }
    }

    async clearSession(key: string): Promise<void> {
        try {
            await this.storage.removeItem(`session:${key}`);
        } catch (error) {
            throw new StorageError(
                `Failed to clear session: ${key}`,
                "DELETE_FAILED",
                error,
            );
        }
    }

    async clear(): Promise<void> {
        try {
            if (this.storage.clear) {
                await this.storage.clear();
            }
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
}
