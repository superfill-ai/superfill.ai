# Release & Versioning Guide

This project uses [Changesets](https://github.com/changesets/changesets) for automated versioning and changelog generation with GitHub releases.

## Overview

**Semantic Versioning (SemVer)**: `MAJOR.MINOR.PATCH`

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features (backward compatible)
- **PATCH** (0.0.1): Bug fixes (backward compatible)

## Workflow

### 1. During Development

When you make changes (features, fixes, etc.), create a changeset:

```bash
bun run changeset:add
# or
bun changeset
```

This will:

1. Ask you to select the version bump type (patch/minor/major)
2. Ask for a summary of changes (used in changelog)
3. Create a `.md` file in `.changeset/` folder

**Example:**

```bash
$ bun changeset
🦋  What kind of change is this for superfill.ai?
  ○ patch - bug fixes, small tweaks
  ● minor - new features, enhancements
  ○ major - breaking changes

🦋  Summary: Added AI provider validation on autofill button
```

This creates a file like `.changeset/happy-pandas-dance.md`:

```md
---
"superfill.ai": minor
---

Added AI provider validation on autofill button
```

### 2. Grouping Changes

You can create **multiple changesets** before releasing. This allows you to group related features/fixes together:

```bash
# Fix 1
bun changeset
# Summary: Fix autofill button alignment

# Fix 2  
bun changeset
# Summary: Add loading state to memory list

# Feature 1
bun changeset
# Summary: Add support for Gemini provider
```

All these will be grouped into a single release when you run the version command.

### 3. Creating a Release

When ready to release (after accumulating changesets):

```bash
bun run version
```

This will:

1. Bump version in `package.json` based on all pending changesets
2. Sync version to `wxt.config.ts` automatically
3. Generate/update `CHANGELOG.md` with all changes
4. Delete consumed changeset files
5. Create a git commit with these changes

**Example output:**

```
🦋  Bumping superfill.ai from 0.0.3 to 0.1.0
📦 Syncing version 0.1.0 to wxt.config.ts...
✅ Version synced successfully!
```

### 4. Publishing the Release

After running `bun run version`, commit and push:

```bash
git add .
git commit -m "chore: release v0.1.0"
git push
```

Then create a GitHub release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Or manually create a release on GitHub, attaching the built extension zips.

## Automated GitHub Releases (CI/CD)

The `.github/workflows/release.yml` workflow automates this process:

1. **On push to main**: Checks for pending changesets
2. **Creates a "Version PR"**: If changesets exist, creates a PR with version bump
3. **On PR merge**: Publishes GitHub release with changelog
4. **Uploads artifacts**: Attaches built extension zips to the release

### Manual Release (Alternative)

If you prefer manual control:

```bash
# 1. Create changesets for all changes
bun changeset

# 2. Bump versions and update changelog
bun run version

# 3. Build and zip extension
bun run build
bun run zip

# 4. Commit version changes
git add .
git commit -m "chore: release v0.1.0"
git push

# 5. Create and push tag
git tag v0.1.0
git push origin v0.1.0

# 6. Create GitHub release manually
# Go to GitHub → Releases → Draft a new release
# - Select tag: v0.1.0
# - Copy changelog from CHANGELOG.md
# - Upload .output/*.zip files
# - Publish release
```

## Commands Reference

```bash
# Create a new changeset
bun changeset
bun changeset:add

# Check what will be released
bun changeset:status

# Bump version and generate changelog
bun run version

# Sync package.json version to wxt.config.ts
bun run sync-version

# Build and release (local)
bun run release
```

## Examples

### Example 1: Single Feature Release

```bash
# Make changes, add a changeset
bun changeset
# Select: minor
# Summary: Add first-time installation redirect to settings

# Create version
bun run version
# Result: 0.0.3 → 0.1.0

# Commit and tag
git commit -m "chore: release v0.1.0"
git tag v0.1.0
git push --follow-tags
```

### Example 2: Multiple Changes Release

```bash
# Fix 1
bun changeset
# patch: Fix popup rendering issue

# Fix 2
bun changeset  
# patch: Improve error messages

# Feature
bun changeset
# minor: Add Gemini AI provider support

# Create version (will use highest bump = minor)
bun run version
# Result: 0.1.0 → 0.2.0

# CHANGELOG.md will include all 3 changes
```

### Example 3: Breaking Change

```bash
bun changeset
# Select: major
# Summary: Restructure storage API (breaking change)

bun run version
# Result: 0.2.0 → 1.0.0
```

## Tips

1. **Commit changesets separately**: Each changeset is a git-friendly file
2. **Write clear summaries**: They appear in changelog and GitHub releases
3. **Use semantic types correctly**: Helps users understand impact
4. **Review CHANGELOG.md**: Before pushing, verify it looks good
5. **Keep version in sync**: The `sync-version` script handles this automatically

## Changelog Format

Changesets generates a beautiful changelog:

```md
# superfill.ai

## 0.2.0

### Minor Changes

- abc123: Add Gemini AI provider support
- def456: Add first-time installation redirect to settings

### Patch Changes

- ghi789: Fix popup rendering issue
- jkl012: Improve error messages

## 0.1.0

### Minor Changes

- Initial release with autofill functionality
```

## Troubleshooting

**Version out of sync?**

```bash
bun run sync-version
```

**Want to see pending changes?**

```bash
bun changeset:status
```

**Need to edit a changeset?**
Edit the `.md` file in `.changeset/` directory directly.

**Remove a changeset?**
Delete the corresponding `.md` file in `.changeset/`.
