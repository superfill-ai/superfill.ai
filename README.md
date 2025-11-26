# <img src="./public/favicon.svg" alt="Superfill.ai favicon" width="32"/> &nbsp; [Superfill.ai](https://superfill.ai)

> An AI-powered browser extension that stores your information once and intelligently auto-fills forms across any website.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![WXT](https://img.shields.io/badge/WXT-Framework-orange.svg)](https://wxt.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<a href="https://www.producthunt.com/products/superfill-ai?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-superfill&#0045;ai" target="_blank" rel="noopener noreferrer"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1039252&theme=neutral&t=1764745107177" alt="superfill&#0046;ai - Stop&#0032;typing&#0046;&#0032;Start&#0032;autofilling&#0032;with&#0032;Superfill&#0046;AI&#0046; | Product Hunt" style="width: 200px, height: 44px" width="200" height="44" /></a>

## 🎯 Overview

Superfill.ai is a cross-browser memory extension that eliminates repetitive data entry by creating an intelligent memory layer. Using AI-powered categorization and matching, it understands form context and provides accurate, relevant answers across job applications, dating sites, rental forms, surveys, and more.

**Current Status**: Phase 1 is complete! Core memory management and AI auto-fill features are live but only for input & textarea fields. Phase 2 (in progress) will add advanced features like select/radio/checkbox/date/async selection options support, alternate fill modes, Safari support, and premium cloud sync features one by one.

(人◕ω◕) Please give this repo a ⭐. Thank you \(★ω★)/

## Try it now

- **Chrome/Edge/Brave/Chromium Based Browsers**: [Install from Chrome Web Store](https://chromewebstore.google.com/detail/superfillai/djkaoeappaeolebcffnckdpcdadlfnfg)
- **Firefox**: [Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/superfill-ai/)

## ✨ Features

### Memory Management

- **Create & Edit Memories**: Question-answer pairs with AI-powered auto-categorization and rephrasing
- **Smart Tagging**: Multi-tag system with intelligent tag suggestions
- **Advanced Filtering**: Search, sort, and filter by category, tags, or content
- **Import/Export**: CSV support for bulk operations and backups

### AI-Powered Intelligence

- **Contextual Matching**: AI matches form fields to stored memories based on context
- **Auto-Fill Suggestions**: AI suggests the best answer for each form field
- **Multiple Providers**: Support for OpenAI, Anthropic, Google, Groq, and DeepSeek
- **AI Categorization**: AI analyzes your answers and suggests categories
- **Rephrasing**: AI can rephrase questions and answers for clarity and relevance
- **Smart Tags**: Automatically extracts relevant keywords from content
- **Confidence Scoring**: Every memory gets a confidence score (0-1)

### Privacy & Security

- **BYOK Model**: Bring your own API keys - no vendor lock-in
- **AES-256 Encryption**: All API keys encrypted with AES-GCM
- **PBKDF2 Key Derivation**: 100,000 iterations for secure key generation
- **Local-First**: All data stored in your browser (Phase 1)
- **No Telemetry**: Zero data collection or analytics

### Modern UI/UX

- **Dark Mode**: Full light/dark theme support with system preference
- **Responsive Design**: Works beautifully in popup (400x600) and full-page mode
- **Keyboard Shortcuts**: `Cmd/Ctrl+Enter` to save, `Esc` to cancel
- **shadcn/ui Components**: Beautiful, accessible UI components
- **Real-time Updates**: Instant feedback with optimistic updates

## 🕹️ Interactive Demo

[Arcade interactive demo link](https://app.arcade.software/share/BOyhluu7rFgB0IzIJMLk)

## 📊 Progress

### ✅ Completed (Phase 1)

- [x] Memory CRUD operations
- [x] AI-powered categorization & tagging
- [x] Encrypted API key storage
- [x] Extension popup & options UI
- [x] Search, filter, sort functionality
- [x] Import/Export (CSV)
- [x] Theme support (light/dark)
- [x] Settings management
- [x] Form detection algorithm
- [x] Field-to-memory matching
- [x] Auto-fill engine with confidence scoring
- [x] Multiple AI provider support (OpenAI, Anthropic, Groq, DeepSeek, Google Gemini)
- [x] Autofill directly without preview mode (autopilot mode)
- [x] Let AI rephrase questions/answers on memory creation
- [x] Top used tags & click-to-add functionality
- [x] Ollama AI provider support
- [x] Let AI rephrase suggested answers on auto-fill based on form, webpage, website & URL context
- [x] Firefox support

### 📋 In Progress (Phase 2, Nov 25th)

#### Free features

##### WIP

- [ ] Store unfilled questions along with user filled answers as memories automatically
- [ ] Parse pdf to extract content for memory creation. Scrape & import data from Linkedin/Portfolio/Workday/Greenhouse/other famous websites for easier memory addition.
- [ ] Safari support

##### NOT STARTED

- [ ] Cache Previous fill results for faster fill on similar form fields/urls
- [ ] Image based matching algorithm for better context understanding
- [ ] Explore alternate modes:
  - [ ] Browser native autofill integration (bypass extension popup)
  - [ ] Trigger mode (Show button input click, page action, context menu, omnibox)
  - [ ] Enhanced Copilot mode (Sidebar with memory suggestions as you type)
- [ ] Support for select, radio, checkbox fields
- [ ] Prompt caching for faster AI responses
- [ ] MCP support
- [ ] Upvote/downvote memory suggestions
- [ ] Semantic search across stored data
- [ ] Customizable autofill shortcuts
- [ ] Customizable autofill templates (Industry-specific templates)
- [ ] Custom AI prompts

---

## 🚀 Quick Start

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup instructions.

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

### Browser Support

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Fully Supported | Manifest V3 |
| Edge | ✅ Fully Supported | Chrome-compatible |
| Firefox | ✅ Fully Supported | WXT supports MV2/MV3 |
| Safari | 🚧 In Progress | Requires adjustments |

## 🤝 Contributing

Contributions are welcome! This is an open-source project (Core features will always remain free & open-source).

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read our [AI Development Guide](AGENTS.md) for code style and architecture guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Ankit Dabas** - Helping me with design and UX ideas. Check him out: [Behance](https://www.behance.net/yelloworld), [LinkedIn](https://www.linkedin.com/in/yelloworld/)
- **WXT Framework** - Modern extension development
- **shadcn/ui** - Beautiful component library
- **Vercel AI SDK** - Unified LLM interface
- **Bun** - Lightning-fast runtime

**Built with ❤️ by [mikr13](https://mikr13.com) using AI-first principles**. Give this repo a ⭐ if you found it helpful!
