# Superfill.ai Monorepo

AI-powered form filling for browser and desktop. This monorepo contains the browser extension and desktop app, sharing UI components, types, AI logic, and storage.

## 📦 Monorepo Structure

```
superfill.ai/
├── apps/
│   ├── extension/          # Browser extension (WXT + React)
│   └── desktop/            # Electron desktop app (coming soon)
├── packages/
│   ├── ui/                 # Shared shadcn components
│   ├── shared/             # Types, AI logic, providers
│   ├── storage/            # Abstract storage layer
│   └── tsconfig/           # Shared TypeScript configs
└── turbo.json              # Turborepo configuration
```

## 🚀 Quick Start

### Prerequisites

- **Bun** >= 1.0.0 (package manager)
- **Node.js** >= 20.0.0 (runtime)
- **Turbo** (installed globally): `bun add turbo --global`

### Install Dependencies

```bash
bun install
```

### Development

```bash
# Run all apps in development mode
bun run dev

# Run specific app
bun run dev --filter=@superfill/extension
```

### Build

```bash
# Build all packages and apps
bun run build

# Build specific app
bun run build --filter=@superfill/extension
```

## 📚 Packages

### `@superfill/ui`

Shared React components (51 shadcn components) used across extension and desktop app.

### `@superfill/shared`

Shared TypeScript types, AI logic, providers, and utilities.

### `@superfill/storage`

Abstract storage layer with adapters:

- `BrowserStorageAdapter` - Uses WXT storage for browser extension
- `FileStorageAdapter` - Uses Node.js fs for desktop app

### `@superfill/tsconfig`

Shared TypeScript configurations for consistent type-checking.

## 🔧 Tech Stack

- **Monorepo**: Turborepo + Bun workspaces
- **Extension**: WXT + React 19 + TypeScript 5.7+
- **Desktop**: Electron + React 19 (coming soon)
- **UI**: shadcn/ui + Tailwind CSS v4
- **AI**: Vercel AI SDK (BYOK - OpenAI, Anthropic, Google, Groq, DeepSeek, Ollama)
- **Storage**: Browser Storage API (extension) / File-based (desktop)

## 📖 Documentation

See individual app READMEs for specific documentation:

- [Browser Extension](./apps/extension/README.md)
- Desktop App (coming soon)

## 🤝 Contributing

Please read [CONTRIBUTING.md](./apps/extension/CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](./apps/extension/LICENSE) for details.

## 🎯 Architecture Philosophy

This monorepo follows these principles:

1. **Code Reuse**: Share 80%+ of UI and logic between extension and desktop
2. **BYOK Model**: Users provide their own API keys (no vendor lock-in)
3. **OSS & Free**: 100% open source and student-friendly
4. **Type Safety**: Strict TypeScript across all packages
5. **Platform-Specific Hooks**: Create platform-specific variants when needed

Built with ❤️ for students and job seekers.
