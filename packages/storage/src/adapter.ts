import type { MemoryEntry } from "@superfill/shared/types/memory";
import type { AISettings, UISettings } from "@superfill/shared/types/settings";

/**
 * Combined settings type for storage operations
 */
export type Settings = {
    ai: AISettings;
    ui: UISettings;
};

/**
 * Abstract storage adapter interface for Superfill.ai
 * 
 * Implementations:
 * - BrowserStorageAdapter: Uses WXT storage API for browser extension
 * - FileStorageAdapter: Uses Node.js fs for desktop app (~/.config/superfill/)
 */
export interface IStorageAdapter {
    // Memory operations
    getMemories(): Promise<MemoryEntry[]>;
    saveMemories(memories: MemoryEntry[]): Promise<void>;
    addMemory(memory: MemoryEntry): Promise<void>;
    updateMemory(id: string, memory: Partial<MemoryEntry>): Promise<void>;
    deleteMemory(id: string): Promise<void>;

    // Settings operations
    getSettings(): Promise<Settings>;
    saveSettings(settings: Settings): Promise<void>;
    updateSettings(partial: Partial<Settings>): Promise<void>;

    // Session operations
    getSession(key: string): Promise<unknown>;
    setSession(key: string, value: unknown): Promise<void>;
    clearSession(key: string): Promise<void>;

    // Utility operations
    clear(): Promise<void>;
    export(): Promise<{ memories: MemoryEntry[]; settings: Settings }>;
    import(data: { memories?: MemoryEntry[]; settings?: Partial<Settings> }): Promise<void>;
}

/**
 * Storage adapter error types
 */
export class StorageError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly originalError?: unknown
    ) {
        super(message);
        this.name = "StorageError";
    }
}

export class StorageNotFoundError extends StorageError {
    constructor(key: string) {
        super(`Storage key not found: ${key}`, "NOT_FOUND");
    }
}

export class StoragePermissionError extends StorageError {
    constructor(message: string) {
        super(message, "PERMISSION_DENIED");
    }
}

export class StorageCorruptionError extends StorageError {
    constructor(key: string, originalError?: unknown) {
        super(`Storage data corrupted for key: ${key}`, "CORRUPTED", originalError);
    }
}
