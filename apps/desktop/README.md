# Superfill Desktop

Desktop application for Superfill with browser automation powered by Stagehand.

## Features

- 🧠 Memory management (shared with browser extension)
- 🤖 Browser automation using Stagehand (BYOK)
- 💾 File-based storage at `~/.config/superfill/`
- 🎨 Reuses UI components from @superfill/ui

## Development

```bash
# Install dependencies
bun install

# Start development mode
bun run dev

# Build application
bun run build

# Type check
bun run type-check

# Lint
bun run lint
```

## Architecture

- **Main Process**: Electron main, handles window management, file I/O, Stagehand automation
- **Renderer Process**: React app with shared UI components
- **Storage**: FileStorageAdapter for `~/.config/superfill/`
- **Automation**: Stagehand with LOCAL mode, BYOK models (OpenAI, Anthropic, Ollama, etc.)

## Tech Stack

- Electron 34
- React 19 + TypeScript
- Vite (via electron-vite)
- Stagehand v3
- Shared packages: @superfill/ui, @superfill/shared, @superfill/storage
