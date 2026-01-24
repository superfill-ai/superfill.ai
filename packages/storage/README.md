# @superfill/storage

Abstract storage layer for Superfill.ai with platform-specific adapters.

## Architecture

The storage package provides a unified interface (`IStorageAdapter`) with two implementations:

### BrowserStorageAdapter

Uses WXT storage API for the browser extension. Data is stored in browser's local storage.

```typescript
import { BrowserStorageAdapter } from '@superfill/storage/browser';
import { storage } from 'wxt/storage';

const adapter = new BrowserStorageAdapter(storage);
```

### FileStorageAdapter

Uses Node.js `fs` module for the desktop app. Data is stored in platform-specific config directory:

- **Linux/macOS**: `~/.config/superfill/`
- **Windows**: `%APPDATA%\superfill\`

```typescript
import { FileStorageAdapter } from '@superfill/storage/file';

const adapter = new FileStorageAdapter();
await adapter.initialize();
```

## Usage

### Memory Operations

```typescript
// Get all memories
const memories = await adapter.getMemories();

// Add a memory
await adapter.addMemory(newMemory);

// Update a memory
await adapter.updateMemory(id, { answer: 'New value' });

// Delete a memory
await adapter.deleteMemory(id);
```

### Settings Operations

```typescript
// Get settings
const settings = await adapter.getSettings();

// Update settings
await adapter.updateSettings({ aiProvider: 'anthropic' });
```

### Session Operations (temporary data)

```typescript
// Set session data
await adapter.setSession('tempKey', value);

// Get session data
const value = await adapter.getSession('tempKey');

// Clear session data
await adapter.clearSession('tempKey');
```

### Import/Export

```typescript
// Export all data
const data = await adapter.export();

// Import data
await adapter.import({ memories, settings });
```

### File Watching (FileAdapter only)

The file adapter supports watching for changes (useful for syncing):

```typescript
const unwatch = await fileAdapter.watchMemories((memories) => {
  console.log('Memories changed:', memories);
});

// Stop watching
unwatch();
```

## Shared Storage Location

Both extension (via future Native Messaging) and desktop app can read/write to:

- `~/.config/superfill/memories.json`
- `~/.config/superfill/settings.json`

This enables seamless sync between extension and desktop app.

## Error Handling

The package exports specific error types:

- `StorageError` - Base error class
- `StorageNotFoundError` - Key not found
- `StoragePermissionError` - Permission denied
- `StorageCorruptionError` - Corrupted data

```typescript
import { StorageError, StorageCorruptionError } from '@superfill/storage/adapter';

try {
  await adapter.getMemories();
} catch (error) {
  if (error instanceof StorageCorruptionError) {
    // Handle corrupted data
  }
}
```
