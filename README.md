# <img src="./public/favicon.svg" alt="Superfill.ai favicon" width="32"/> &nbsp; [Superfill.ai](https://superfill.ai)

> An AI-powered browser extension that stores your information once and intelligently auto-fills forms across any website.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![WXT](https://img.shields.io/badge/WXT-Framework-orange.svg)](https://wxt.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🎯 Overview

Superfill.ai is a cross-browser memory extension that eliminates repetitive data entry by creating an intelligent memory layer. Using AI-powered categorization and matching, it understands form context and provides accurate, relevant answers across job applications, dating sites, rental forms, surveys, and more.

**Current Status**: Phase 1 In-progress - Local storage with BYOK (Bring Your Own Key) AI integration

(人◕ω◕) Please give this repo a ⭐. Thank you \(★ω★)/

---

## ✨ Features

### 🧠 Memory Management

- **Create & Edit Memories**: Question-answer pairs with AI-powered auto-categorization
- **Smart Tagging**: Multi-tag system with intelligent tag suggestions
- **Advanced Filtering**: Search, sort, and filter by category, tags, or content
- **Virtual Scrolling**: Handle 1000+ memories without performance issues
- **Import/Export**: CSV support for bulk operations and backups

### 🤖 AI-Powered Intelligence

- **Auto-Categorization**: AI analyzes your answers and suggests categories
- **Smart Tags**: Automatically extracts relevant keywords from content
- **Confidence Scoring**: Every memory gets a confidence score (0-1)
- **Multiple Providers**: Support for OpenAI, Anthropic, Google, Groq, and DeepSeek

### 🔒 Privacy & Security

- **BYOK Model**: Bring your own API keys - no vendor lock-in
- **AES-256 Encryption**: All API keys encrypted with AES-GCM
- **PBKDF2 Key Derivation**: 100,000 iterations for secure key generation
- **Local-First**: All data stored in your browser (Phase 1)
- **No Telemetry**: Zero data collection or analytics

### 🎨 Modern UI/UX

- **Dark Mode**: Full light/dark theme support with system preference
- **Responsive Design**: Works beautifully in popup (400x600) and full-page mode
- **Keyboard Shortcuts**: `Cmd/Ctrl+Enter` to save, `Esc` to cancel
- **shadcn/ui Components**: Beautiful, accessible UI components
- **Real-time Updates**: Instant feedback with optimistic updates

---

## 🛠️ Tech Stack

### Core Framework

- **WXT** - Next-gen browser extension framework with Vite
- **React 19** - Latest React with concurrent features
- **TypeScript 5.7+** - Strict type safety throughout
- **Bun** - Ultra-fast runtime and package manager

### UI & Styling

- **shadcn/ui** - Copy-paste accessible components
- **Tailwind CSS v4** - Utility-first styling
- **Radix UI** - Headless UI primitives
- **TanStack Form** - Type-safe form management

### State & Storage

- **Zustand** - Minimal state management (<1KB)
- **WXT Storage API** - Cross-browser compatible storage
- **@tanstack/react-virtual** - Virtual scrolling for performance

### AI Integration

- **Vercel AI SDK v5** - Unified LLM interface
- **Zod** - Runtime type validation
- **Structured Outputs** - Type-safe AI responses

### Security

- **Web Crypto API** - Native browser encryption
- **AES-GCM** - Authenticated encryption
- **PBKDF2** - Key derivation function

---

## 🚀 Quick Start

### Prerequisites

- **Bun** v1.1+ ([Install Bun](https://bun.sh/))
- **Node.js** 20+ (for compatibility)
- Modern browser (Chrome, Edge, Firefox)

### Installation

```bash
# Clone the repository
git clone https://github.com/mikr13/superfill.ai.git
cd superfill.ai

# Install dependencies
bun install

# Start development mode
bun dev
```

### Load Extension in Chrome/Edge

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` directory

### Configure API Keys

1. Click the extension icon in your browser
2. Go to Settings (gear icon)
3. Enter your API key for any supported provider:
   - **OpenAI**: Get key at [platform.openai.com](https://platform.openai.com/)
   - **Anthropic**: Get key at [console.anthropic.com](https://console.anthropic.com/)
   - **Groq**: Get key at [console.groq.com](https://console.groq.com/)
   - **DeepSeek**: Get key at [platform.deepseek.com](https://platform.deepseek.com/)
   - **Gemini (Google)**: Get key at [cloud.google.com/ai-generate](https://aistudio.google.com/)
4. Select your preferred provider
5. Click "Save API Keys"

---

## 🎮 Usage

### Adding a Memory

1. Click the extension icon
2. Go to "Add Memory" tab
3. Enter your answer (question is optional)
4. AI will auto-suggest tags and category
5. Press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows) to save

### Managing Memories

1. Open extension options page (Settings → Full Page)
2. Go to "Memory" tab
3. Search, filter, or sort memories
4. Click any memory card to edit/delete/duplicate
5. Use Import/Export for bulk operations
6. Download CSV template for correct format

### Configuring Settings

1. Open extension options page
2. Go to "Settings" tab
3. Configure:
   - **Theme**: Light/Dark/System
   - **Autofill**: Enable/disable + confidence threshold
   - **API Keys**: Set provider credentials
   - **Trigger Mode**: Popup (default, others coming soon)
   - **Copilot Mode**: Enable/disable (coming soon)

---

## 🧪 Development

### Commands

```bash
# Development mode with HMR
bun dev

# Build for production
bun build

# Build for specific browser
bun build --browser firefox

# Type checking
bun run typecheck

# Lint code
bun run lint
```

### Browser Support

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Fully Supported | Manifest V3 |
| Edge | ✅ Fully Supported | Chrome-compatible |
| Firefox | 🚧 Planned | WXT supports MV2/MV3 |
| Safari | 🚧 Planned | Requires adjustments |

---

## 📊 Current Progress

### 🚧 In Progress (Phase 1)

- [x] Memory CRUD operations
- [x] AI-powered categorization & tagging
- [x] Encrypted API key storage
- [x] Extension popup & options UI
- [x] Search, filter, sort functionality
- [x] Import/Export (CSV)
- [x] Theme support (light/dark)
- [x] Virtual scrolling performance
- [x] Settings management
- [x] Form detection algorithm
- [x] Field-to-memory matching
- [x] Auto-fill functionality
- [x] Auto-fill engine
- [x] Multiple AI provider support (OpenAI, Anthropic, Groq, DeepSeek, Google Gemini)
- [x] Autofill directly without preview mode (autopilot mode)
- [ ] Auto adding memories from filled forms based on user confirmation
- [x] Let AI rephrase questions/answers on memory creation (Thanks [@pratham-kpatil](https://github.com/pratham-kpatil)! 🙏)
- [x] Top used tags & click-to-add functionality
- [ ] Let AI rephrase answers on auto-fill based on form context
- [ ] Firefox support
- [ ] Scrape & import data from Linkedin/Portfolio/Workday/Greenhouse/other famous websites for easier memory addition
- [ ] Semantic search across stored data
- [ ] Mark memories as favorites
- [ ] Browser native autofill integration (bypass extension popup)

### 📋 In Progress (Phase 2, Nov 15th)

#### Free features

- [ ] MCP support (Multi-Context Profiles)
- [ ] Upvote/downvote memory suggestions
- [ ] Multi page form support
- [ ] Customizable autofill shortcuts
- [ ] Customizable autofill templates (Industry-specific templates)
- [ ] Custom AI prompts
- [ ] Parse pdf to extract content for memory creation

#### Premium features

- [x] Cloud AI model integration
- [x] Sign in & cloud sync
- [ ] Multi-device support
- [ ] Reinforcement learning for user corrections
- [ ] AI model memory prediction improvement
- [ ] RAG (Retrieval-Augmented Generation) for large datasets (> 100 memories)
- [ ] Team features
- [ ] Analytics dashboard
- [ ] SOC 2 Type II certification
- [ ] GDPR compliance
- [ ] Data residency options
- [ ] Audit logs
- [ ] SSO integration

---

## 🤝 Contributing

Contributions are welcome! This is an open-source project (Core features will always remain free & open-source).

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read our [AI Development Guide](AGENTS.md) for code style and architecture guidelines.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Ankit Dabas** - Helping me with design and UX ideas. Check him out: [Behance](https://www.behance.net/yelloworld), [LinkedIn](https://www.linkedin.com/in/yelloworld/)
- **WXT Framework** - Modern extension development
- **shadcn/ui** - Beautiful component library
- **Vercel AI SDK** - Unified LLM interface
- **Bun** - Lightning-fast runtime

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/mikr13/superfill.ai/issues)

---

**Built with ❤️ by [mikr13](https://mikr13.com) using AI-first principles**. Give this repo a ⭐ if you found it helpful!
