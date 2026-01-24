# AGENTS.md - AI Development Guide

## Purpose

This document guides AI assistants on how to work on this browser extension project systematically. It ensures consistent progress tracking, code quality, and follows the established architecture.

## 🎯 Project Overview

**Product**: Cross-Browser Memory System - An AI-powered browser extension that stores user information once and intelligently auto-fills forms across websites.

**Tech Stack**:

- **Framework**: WXT (browser extension framework)
- **Frontend**: React 19 + TypeScript 5.7+
- **UI**: shadcn/ui + Tailwind CSS v4
- **AI**: Vercel AI SDK (BYOK for OpenAI/Anthropic)
- **Storage**: Browser Storage API (Phase 1) via WXT's storage wrapper
- **Runtime & Package management**: Bun
- **@webext-core/proxy-service**: For messaging between extension entrypoints. This allows us to directly call functions in other entrypoints without complex message passing & listeners.

## 📁 Progress Tracking System

### Location

All progress tracking happens in the `development/` folder (git-ignored):

```sh
development/
├── progress.md          # Current progress and task status
├── decisions.md         # Architecture decisions made during development
├── features.md          # Feature specifications and changes 
```

### Progress File Format (`development/progress.md`)

The progress file uses this structure:

```markdown
# Development Progress

**Last Updated**: [ISO Date]
**Current Phase**: [Phase Name]
**Overall Progress**: [X]%

## Week [N] - [Date Range]

### ✅ Completed Tasks
- [x] Task ID: Task Description
  - **Files Modified**: `path/to/file.ts`, `path/to/file2.tsx`
  - **Commit**: Short commit message
  - **Notes**: Any important implementation details

### 🚧 In Progress
- [ ] Task ID: Task Description
  - **Status**: [Started/Blocked/Review]
  - **Blocker**: [If blocked, describe issue]
  - **Next Steps**: What needs to happen next

### 📋 Pending Tasks
- [ ] Task ID: Task Description
  - **Dependencies**: [List any blocking tasks]
  - **Priority**: [High/Medium/Low]
  - **Estimated Time**: [hours]

### ⚠️ Issues & Blockers
- **Issue**: Description
  - **Impact**: What's affected
  - **Workaround**: Temporary solution (if any)
  - **Resolution Plan**: How to fix permanently

```

## 🤖 How AI Should Work on This Project

### 1. Before Starting Any Task

1. **Read the progress file**:

   ```md
   Read `development/progress.md` to understand current state
   ```

2. **Identify next task**:
   - Look for tasks marked as "In Progress" first
   - If none, pick highest priority "Pending" task
   - Check dependencies are completed

3. **Understand context**:
   - Read related completed tasks
   - Review technical decisions that might affect this task
   - Check for known issues that might be relevant

### 2. During Implementation

1. **Follow the architecture**:
   - Refer to main specification document
   - Use TypeScript strictly (no `any` types)
   - Follow existing patterns in the codebase
   - Use existing utilities and components
   - Use @webext-core/proxy-service for cross-entrypoint communication

2. **Code quality standards**:
   - Write type-safe code with proper interfaces
   - Handle errors gracefully (try-catch, null checks)
   - Use semantic HTML and accessible components
   - Follow existing naming conventions
   - DO NOT GENERATE ANY DOCUMENTATION OR .MD FILES UNLESS SPECIFICALLY INSTRUCTED

3. **File organization**:

   ```sh
   src/
   ├── components/
   │   ├── ui/              # shadcn components (don't modify)
   │   └── features/        # Feature-specific components
   ├── lib/
   │   ├── ai/              # AI integration utilities
   │   ├── autofill/        # Autofill logic
   |   ├── providers/       # AI providers (OpenAI, Anthropic)
   |   ├── security/        # BYOK and encryption utilities
   │   ├── storage/         # Storage layer
   │   ├── matching/        # Form matching logic
   │   └── utils/           # General utilities
   ├── types/               # TypeScript types/interfaces
   ├── hooks/               # React hooks
   └── entrypoints/         # Extension entry points
   ```

4. **Testing requirements**:
   - Test in development mode (`bun run dev`)
   - Test all happy paths
   - Test error cases
   - Verify in actual browser extension environment

### 3. After Completing a Task

1. **Update progress file**:

   ```markdown
   ### ✅ Completed Tasks
   - [x] TASK-001: Implement storage wrapper
     - **Files Modified**: `src/lib/storage/index.ts`
     - **Commit**: "Add browser storage wrapper with type safety"
     - **Notes**: Used WXT's storage API for cross-browser compatibility
   ```

2. **Document decisions**:
   If you made any architectural or technical decisions, add to `development/decisions.md`:

   ```markdown
   ## [Date] - Storage Layer Implementation
   **Decision**: Use WXT's storage API instead of direct browser.storage
   **Rationale**: Provides cross-browser compatibility and better TypeScript support
   **Alternatives**: Direct browser API, localforage
   **Trade-offs**: Adds WXT dependency but simplifies cross-browser testing
   ```

3. **Note any issues**:
   If you discovered issues, add to `development/issues.md`:

   ```markdown
   ## [Date] - Storage Size Limitations
   **Issue**: Browser.storage.local has 5MB limit in Chrome
   **Impact**: Large resume data might exceed limit
   **Workaround**: Compress data using LZ-string before storage
   **Resolution Plan**: Implement in storage layer, add size monitoring
   ```

4. **Update task status**:
   - Move task from "In Progress" or "Pending" to "Completed"
   - Check if completing this task unblocks others
   - Update dependencies for other tasks

### 4. When Encountering Blockers

1. **Document immediately**:

   ```markdown
   ### 🚧 In Progress
   - [ ] TASK-005: Implement AI categorization
     - **Status**: Blocked
     - **Blocker**: Need to finalize data schema for categories
     - **Next Steps**: Discuss with user, review common form fields
   ```

2. **Provide context**:
   - Explain what you tried
   - Share error messages or unexpected behavior
   - Suggest possible solutions

3. **Don't move forward**:
   - Don't make assumptions that could require major refactoring
   - Don't skip the blocked task and move to another that depends on it
   - Do move to an independent task if available

## 📋 Task Prompt Template

When asking AI to implement a task, use this format:

```md
Context:
- Current file structure: [relevant files]
- Related completed tasks: [TASK-XXX]
- Dependencies: [any required tasks]

Task: [Task ID and Description]

Requirements:
1. [Specific requirement 1]
2. [Specific requirement 2]
3. [Error handling requirements]
4. [Type safety requirements]

Acceptance Criteria:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Tests pass
- [ ] TypeScript compiles without errors

Files to modify/create:
- `path/to/file.ts`

Please implement this following the project's architecture and update the progress file.
```

## 🔍 Code Review Checklist

Before marking a task complete, verify:

- [ ] **TypeScript**: No `any` types, proper interfaces defined
- [ ] **Error Handling**: Try-catch blocks, null checks, user-friendly errors
- [ ] **Performance**: No unnecessary re-renders, debounced expensive operations
- [ ] **Accessibility**: Proper ARIA labels, keyboard navigation
- [ ] **Consistency**: Follows existing patterns and naming conventions
- [ ] **Documentation**: JSDoc comment ONLY for complex functions with tricky/hacky/todo logic, inline comments ONLY for tricky/hacky/todo logic
- [ ] **Testing**: Manually tested in browser extension environment
- [ ] **Storage**: Efficient use of storage, proper serialization/deserialization
- [ ] **UI/UX**: Matches design system, responsive, good loading states

## 🚫 Common Mistakes to Avoid

1. **Don't use localStorage/sessionStorage**: Use browser.storage.local via WXT's storage API
2. **Don't use external CDNs**: All dependencies must be bundled
3. **Don't ignore TypeScript errors**: Fix them, don't use `@ts-ignore`
4. **Don't hardcode API keys**: Always use the BYOK system
5. **Don't make breaking changes**: Maintain backward compatibility with stored data
6. **Don't skip error handling**: All async operations need try-catch
7. **Don't forget cross-browser testing**: Test in Chrome, Firefox, Edge
8. **Don't use console.log in production**: Use proper logging utility
9. **Don't create duplicate utilities**: Check if functionality already exists

## 🎨 UI/UX Guidelines

1. **Use existing shadcn components**: Don't create custom components if shadcn has it
2. **Follow Tailwind classes**: Use utility classes, avoid custom CSS
3. **Maintain dark mode support**: Test in both light and dark themes
4. **Loading states**: Show loading spinners for async operations
5. **Error states**: Display user-friendly error messages
6. **Empty states**: Show helpful messages when no data exists
7. **Confirmation dialogs**: For destructive actions (delete, clear all)
8. **Keyboard shortcuts**: Implement and document keyboard navigation
9. **Responsive design**: Works in popup (400px width) and full page modes
10. **Accessibility**: Proper focus management, ARIA labels

## 📊 Progress Reporting

At the end of each work session, provide a summary:

```markdown
## Session Summary - [Date]

**Duration**: [hours]
**Tasks Completed**: [count]
**Tasks In Progress**: [count]
**Blockers**: [count]

### Key Achievements
- Completed TASK-XXX: [brief description]
- Fixed issue with [component/feature]
- Improved [specific aspect]

### Next Session Focus
- Continue TASK-YYY
- Address blocker on TASK-ZZZ
- Review and test [feature]

### Questions for User
1. [Question about unclear requirements]
2. [Question about design decisions]
```

## 🔄 Git Workflow (when applicable)

1. **Commit messages format**:

   ```md
   [TASK-XXX] Brief description
   
   - Detailed change 1
   - Detailed change 2
   
   Related to: TASK-XXX
   ```

2. **Commit frequency**:
   - After each logical unit of work
   - Before switching to a different task
   - When a feature is working (even if not complete)

3. **Branch naming** (if using branches):

   ```md
   feature/TASK-XXX-brief-description
   bugfix/TASK-XXX-brief-description
   ```

## 📚 Reference Documents

- **Main Specification**: `/docs/specification.md`
- **Architecture Diagrams**: In main specification
- **API Documentation**: Generate as you go in `/docs/api/`
- **Component Documentation**: Use Storybook or inline JSDoc

## 🆘 When You Need Help

If you're stuck or uncertain:

1. **Document the question** in progress file
2. **Provide context**: What you're trying to do, what you've tried
3. **Suggest options**: Possible approaches with pros/cons
4. **Highlight impact**: What's blocked by this decision
5. **Ask the user**: Present the question clearly for user input

## ✨ Best Practices

1. **Start small**: Implement the simplest version first, iterate
2. **Test continuously**: Don't accumulate untested code
3. **Document as you go**: Don't leave documentation for later
4. **Think about edge cases**: Empty states, error states, boundary conditions
5. **Consider performance**: Debounce, throttle, lazy load when appropriate
6. **Plan for Phase 2**: Don't make decisions that block cloud sync
7. **Keep it simple**: Don't over-engineer, YAGNI principle
8. **Be consistent**: Follow established patterns religiously
9. **Think about users**: Every decision should consider user experience
10. **Stay organized**: Update progress file religiously

---

## 🚀 Getting Started

1. Create the `development/` folder:

   ```bash
   mkdir -p development
   touch development/progress.md
   touch development/decisions.md
   touch development/issues.md
   touch development/testing-notes.md
   ```

2. Initialize progress file with current state

3. Review the 60-day implementation plan

4. Start with TASK-001 and follow the workflow

---

**Remember**: This is a complex project with AI integration. Take time to understand each piece before implementing. Quality over speed. The goal is a production-ready, maintainable codebase that users will love.
