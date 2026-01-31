# Contributing to Superfill.ai

Thank you for your interest in contributing to Superfill.ai! This guide will help you get started with contributing to this AI-powered browser extension.

## 🎯 Project Overview

Superfill.ai is a cross-browser memory extension that eliminates repetitive data entry by creating an intelligent memory layer. Using AI-powered categorization and matching, it understands form context and provides accurate, relevant answers across various web forms.

**Tech Stack**:

- **Framework**: WXT (browser extension framework)
- **Frontend**: React 19 + TypeScript 5.7+
- **UI**: shadcn/ui + Tailwind CSS v4
- **AI**: Vercel AI SDK (BYOK for OpenAI/Anthropic/Groq/DeepSeek/Gemini)
- **Storage**: Browser Storage API via WXT's storage wrapper
- **Runtime**: Bun
- **Messaging**: @webext-core/proxy-service for cross-entrypoint communication

## 🚀 Getting Started

### Prerequisites

- **Bun** v1.1+ ([Install Bun](https://bun.sh/))
- **Node.js** 24+ (for compatibility)
- Modern browser (Chrome, Edge, or Firefox)

### Setup

1. **Fork the repository**

   Click the "Fork" button at the top right of the repository page.

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/superfill.ai.git
   cd superfill.ai/extension
   ```

3. **Install dependencies**

   ```bash
   bun install
   ```

4. **Start development mode**

   ```bash
   bun dev
   ```

5. **Load extension in browser**

   WXT handles loading automatically in development mode. To persist browser data:

   Create `wxt-ext.config.ts` in the project root:

   ```ts
   import { existsSync, mkdirSync } from 'node:fs';
   import { resolve } from 'node:path';
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     binaries: {
       chrome: "PATH TO YOUR CHROME/CHROMIUM BROWSER",
     },
     chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
     firefoxProfile: resolve('.wxt/firefox-profile'),
     keepProfileChanges: true,
   });

   const _firefoxProfileDir = resolve('.wxt/firefox-profile');
   if (!existsSync(_firefoxProfileDir)) {
     mkdirSync(_firefoxProfileDir, { recursive: true });
   }
   ```

6. **Configure API Keys** (for testing AI features)

   - Open the extension in your browser
   - Go to Settings
   - Add your API key for any supported provider (OpenAI, Anthropic, etc.)

## 📁 Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn components (don't modify directly)
│   └── features/        # Feature-specific components
├── lib/
│   ├── ai/              # AI integration utilities
│   ├── autofill/        # Autofill logic
│   ├── providers/       # AI providers (OpenAI, Anthropic, etc.)
│   ├── security/        # BYOK and encryption utilities
│   ├── storage/         # Storage layer
│   └── utils/           # General utilities
├── types/               # TypeScript types/interfaces
├── hooks/               # React hooks
└── entrypoints/         # Extension entry points
    ├── background/      # Background service worker
    ├── content/         # Content scripts
    ├── options/         # Options page
    └── popup/           # Extension popup
```

## 🔧 Development Workflow

### 1. Before Starting Work

1. **Check existing issues** or create a new one describing what you want to work on
2. **Create a feature branch**:

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b bugfix/issue-description
   ```

3. **Understand the codebase**:
   - Read `AGENTS.md` for architecture guidelines
   - Review related code in the area you're working on
   - Check `development/progress.md` for current work

### 2. During Development

#### Code Quality Standards

- ✅ **TypeScript**: Use strict typing, no `any` types
- ✅ **Error Handling**: Use try-catch blocks, null checks, user-friendly errors
- ✅ **Performance**: Avoid unnecessary re-renders, debounce expensive operations
- ✅ **Accessibility**: Use proper ARIA labels, ensure keyboard navigation
- ✅ **Consistency**: Follow existing patterns and naming conventions
- ✅ **Comments**: Add JSDoc comments ONLY for complex/tricky logic
- ✅ **Testing**: Manually test in browser extension environment

#### Common Mistakes to Avoid

- ❌ **Don't use localStorage/sessionStorage**: Use browser.storage.local via WXT's API
- ❌ **Don't use external CDNs**: All dependencies must be bundled
- ❌ **Don't ignore TypeScript errors**: Fix them, don't use `@ts-ignore`
- ❌ **Don't hardcode API keys**: Always use the BYOK system
- ❌ **Don't skip error handling**: All async operations need try-catch
- ❌ **Don't use console.log in production**: Use the proper logging utility
- ❌ **Don't create duplicate utilities**: Check if functionality already exists

#### UI/UX Guidelines

1. **Use existing shadcn components** - Don't create custom ones if shadcn has it
2. **Follow Tailwind classes** - Use utility classes, avoid custom CSS
3. **Support dark mode** - Test in both light and dark themes
4. **Show loading states** - Display spinners for async operations
5. **Handle errors gracefully** - Show user-friendly error messages
6. **Provide empty states** - Show helpful messages when no data exists
7. **Confirm destructive actions** - Use dialogs for delete, clear all, etc.
8. **Support keyboard shortcuts** - Implement and document keyboard navigation
9. **Ensure responsiveness** - Works in popup (400px width) and full page
10. **Focus on accessibility** - Proper focus management and ARIA labels

### 3. Testing Your Changes

```bash
# Type checking
bun run type-check

# Lint code
bun run lint

# Build for production
bun build

# Build for specific browser
bun build:firefox
```

**Manual Testing Checklist**:

- [ ] Test in development mode (`bun dev`)
- [ ] Test all happy paths
- [ ] Test error cases (invalid inputs, network failures, etc.)
- [ ] Test in actual browser extension environment
- [ ] Test in both light and dark themes
- [ ] Test keyboard navigation
- [ ] Test with different AI providers
- [ ] Verify no TypeScript errors
- [ ] Verify no console errors

### 4. Committing Your Changes

#### Commit Message Format

Use clear, descriptive commit messages:

```text
[Category] Brief description

- Detailed change 1
- Detailed change 2

Fixes #123 (if applicable)
```

**Categories**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

**Examples**:

```text
feat: Add support for checkbox field autofill

- Implement checkbox detection in form parser
- Add checkbox matching logic
- Update autofill engine to handle checkboxes

Fixes #45
```

```text
fix: Resolve memory deletion confirmation dialog

- Fix dialog not showing on delete action
- Add proper error handling for failed deletions
```

#### Creating a Changeset

We use [Changesets](https://github.com/changesets/changesets) for versioning. After making changes:

```bash
bun changeset
```

This will:

1. Ask you to select the version bump type (patch/minor/major)
2. Ask for a summary of changes (used in changelog)
3. Create a `.md` file in `.changeset/` folder

**Version Types**:

- **patch** (0.0.X): Bug fixes, small tweaks
- **minor** (0.X.0): New features, enhancements
- **major** (X.0.0): Breaking changes

### 5. Submitting a Pull Request

1. **Push your branch**:

   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request**:
   - Go to the repository on GitHub
   - Click "New Pull Request"
   - Select your branch
   - Fill out the PR template with:
     - Clear description of changes
     - Related issue numbers
     - Screenshots (if UI changes)
     - Testing notes

3. **PR Requirements**:
   - [ ] All tests pass
   - [ ] No TypeScript errors
   - [ ] Code follows style guidelines
   - [ ] Changeset created (if applicable)
   - [ ] Documentation updated (if needed)
   - [ ] Tested in browser environment

4. **Review Process**:
   - Maintainers will review your PR
   - Address any requested changes
   - Once approved, your PR will be merged

## 🎨 Style Guidelines

### TypeScript

```typescript
// ✅ Good: Proper typing
interface Memory {
  id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
}

function getMemory(id: string): Memory | null {
  // Implementation
}

// ❌ Bad: Using any
function getMemory(id: any): any {
  // Implementation
}
```

### React Components

```typescript
// ✅ Good: Typed props, proper error handling
interface MemoryCardProps {
  memory: Memory;
  onEdit: (memory: Memory) => void;
  onDelete: (id: string) => void;
}

export function MemoryCard({ memory, onEdit, onDelete }: MemoryCardProps) {
  const handleDelete = async () => {
    try {
      await deleteMemory(memory.id);
      onDelete(memory.id);
    } catch (error) {
      logger.error('Failed to delete memory', error);
      toast.error('Failed to delete memory');
    }
  };

  return (
    // Component JSX
  );
}
```

### Error Handling

```typescript
// ✅ Good: Proper error handling
try {
  const result = await apiCall();
  return result;
} catch (error) {
  logger.error('API call failed', error);
  throw new AppError('Failed to fetch data', { cause: error });
}

// ❌ Bad: Swallowing errors
try {
  await apiCall();
} catch (error) {
  // Silent failure
}
```

## 📋 Available Commands

```bash
# Development
bun dev              # Start development mode with HMR
bun dev:firefox      # Start development for Firefox

# Building
bun build            # Build for all browsers
bun build:firefox    # Build for Firefox only
bun zip              # Create distribution zips

# Quality
bun run type-check    # Type checking
bun run lint         # Lint code

# Versioning
bun changeset        # Create a new changeset
bun changeset:status # Check what will be released
bun run version      # Bump version and generate changelog
bun run sync-version # Sync package.json version to wxt.config.ts

# Release
bun run release      # Build and create distribution
```

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Description**: Clear description of the issue
2. **Steps to Reproduce**: Detailed steps to reproduce the bug
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**:
   - Browser and version
   - Extension version
   - Operating system
6. **Screenshots**: If applicable
7. **Console Errors**: Any error messages from browser console

## 💡 Suggesting Features

When suggesting features:

1. **Use Case**: Describe the problem you're trying to solve
2. **Proposed Solution**: How you think it should work
3. **Alternatives**: Any alternative solutions you've considered
4. **Additional Context**: Screenshots, mockups, or examples

## 📚 Additional Resources

- **Architecture Guide**: Read `AGENTS.md` for detailed architecture
- **Specification**: Check `internal/memory_extension_spec.md`
- **Progress Tracking**: See `development/progress.md`
- **WXT Documentation**: [wxt.dev](https://wxt.dev/)
- **shadcn/ui**: [ui.shadcn.com](https://ui.shadcn.com/)
- **Vercel AI SDK**: [sdk.vercel.ai](https://sdk.vercel.ai/)

## 🤝 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help newcomers get started
- Follow the project's guidelines

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Questions?

If you have questions:

1. Check existing issues and discussions
2. Read the documentation in `AGENTS.md` and `README.md`
3. Create a new issue with the "question" label
4. Join discussions on GitHub

---

**Thank you for contributing to Superfill.ai!** Your contributions help make form filling easier for everyone. 🚀
