# superfill.ai

## 0.1.2

### Patch Changes

- [`851bd03`](https://github.com/superfill-ai/superfill.ai/commit/851bd03517d6a872b12a58d1e2fa12bf4e0f3227) Thanks [@mikr13](https://github.com/mikr13)! - refactor: migrate AI settings management to storage and remove zustand store

- [`3f58a93`](https://github.com/superfill-ai/superfill.ai/commit/3f58a93d311c7d8c0652cd36a49f17369eaf518a) Thanks [@mikr13](https://github.com/mikr13)! - refactor: migrate session and form mappings management to storage and remove zustand stores

- [`24d5fcd`](https://github.com/superfill-ai/superfill.ai/commit/24d5fcdfbf45adc6b64c0bb3b5c2a4814f55715a) Thanks [@mikr13](https://github.com/mikr13)! - refactor: migrate memory management to hooks and remove zustand store

- [`ab49f4b`](https://github.com/superfill-ai/superfill.ai/commit/ab49f4b55f7adadb268eab009f120c31cf65c817) Thanks [@mikr13](https://github.com/mikr13)! - refactor: migrate UI settings management to storage and remove unused store

## 0.1.1

### Patch Changes

- [#12](https://github.com/superfill-ai/superfill.ai/pull/12) [`204b538`](https://github.com/superfill-ai/superfill.ai/commit/204b5386bb9a48e40de9e9f6188e7dab52835292) Thanks [@mikr13](https://github.com/mikr13)! - feat: implement form mappings, memories, sessions, and UI settings stores with zustand

- [`f000856`](https://github.com/superfill-ai/superfill.ai/commit/f000856459704b5cf3e585c1c35f6d5b4518bd32) Thanks [@mikr13](https://github.com/mikr13)! - feat: enhance state management in AI, data, and UI settings stores with storage synchronization

- [#11](https://github.com/superfill-ai/superfill.ai/pull/11) [`408c2bf`](https://github.com/superfill-ai/superfill.ai/commit/408c2bfb6ec1be35c95418bbd0ca6514e820d309) Thanks [@pratham-kpatil](https://github.com/pratham-kpatil)! - - Resolved the issue of state mamnagent for autofill service and content index
  - Updated autofill-services.ts, content/index.tsUpdated autofill-services.ts to read the state directly from local storage

## 0.1.0

### Minor Changes

- [#7](https://github.com/superfill-ai/superfill.ai/pull/7) [`8614481`](https://github.com/superfill-ai/superfill.ai/commit/861448159196c3cee5d83f1ae1114962abb07d31) Thanks [@pratham-kpatil](https://github.com/pratham-kpatil)! - - Added feature to fetch website context
  - Website context is used in ai matching stage to improve the field mapping
  - Website context is used to rephrase the answers if required
  - AI prompts have been enhanced with specific rules and instructions for contextual rephrasing

### Patch Changes

- [#10](https://github.com/superfill-ai/superfill.ai/pull/10) [`f1ff97b`](https://github.com/superfill-ai/superfill.ai/commit/f1ff97bb5ef73fd95e2a5580d3960d0b599c65d8) Thanks [@mikr13](https://github.com/mikr13)! - refactor: state management refac of zustand & storage

- [`e00c23f`](https://github.com/superfill-ai/superfill.ai/commit/e00c23fdfca0db5fd95c262530015ec28d116a04) Thanks [@mikr13](https://github.com/mikr13)! - feat: update Tailwind CSS dependencies and integrate Vite plugin

- [#7](https://github.com/superfill-ai/superfill.ai/pull/7) [`8614481`](https://github.com/superfill-ai/superfill.ai/commit/861448159196c3cee5d83f1ae1114962abb07d31) Thanks [@pratham-kpatil](https://github.com/pratham-kpatil)! - feat(autofill): Implement user choice for AI-rephrased memories

  This commit enhances the autofill preview by allowing users to choose between the AI-rephrased suggestion and their original stored memory.

  - **UI Toggle**: The preview component now includes a toggle button to switch between the "AI Rephrased Memory" and "Original Memory" views. The UI dynamically updates labels and styles to reflect the current selection.

  - **Manual Fill**: The manual "Fill Selected" action now respects the user's choice. The `preview-manager` has been updated to fill the form with the value selected in the UI (original or rephrased).

  - **Autopilot Logic**: The `autopilot-manager` is updated to consistently use the `rephrasedValue` when available, ensuring predictable behavior in automated mode.

- [#6](https://github.com/superfill-ai/superfill.ai/pull/6) [`cc999d9`](https://github.com/superfill-ai/superfill.ai/commit/cc999d942c4faac3143f6906227dfd5015733674) Thanks [@sweta-tw](https://github.com/sweta-tw)! - refactor: remove simple field mapping logic for autofill

- [`381837d`](https://github.com/superfill-ai/superfill.ai/commit/381837d4945111b2922c5825b14238d105d6258d) Thanks [@mikr13](https://github.com/mikr13)! - fix: firefox csp issue fixed

- [#8](https://github.com/superfill-ai/superfill.ai/pull/8) [`67f5a7e`](https://github.com/superfill-ai/superfill.ai/commit/67f5a7e726f207b9cb89a4b9de71f923ba65c638) Thanks [@pratham-kpatil](https://github.com/pratham-kpatil)! - Automatically Refresh model list on API key add/change

## 0.0.8

### Patch Changes

- [`b8f06ba`](https://github.com/superfill-ai/superfill.ai/commit/b8f06ba2386bb2657735fa842f4d07a0c9fd1a2c) Thanks [@mikr13](https://github.com/mikr13)! - feat: add Ollama AI provider support and enhance connection validation

## 0.0.7

### Patch Changes

- [`177e49a`](https://github.com/superfill-ai/superfill.ai/commit/177e49a91f765d5a23904621077444701a602769) Thanks [@mikr13](https://github.com/mikr13)! - fix: improve browser fingerprinting details

- [`26818ef`](https://github.com/superfill-ai/superfill.ai/commit/26818efce824e3ccfba351e529f875f15346773c) Thanks [@mikr13](https://github.com/mikr13)! - refactor: streamline entry form logic and enhance categorization with AI integration

- [`2bebfdd`](https://github.com/superfill-ai/superfill.ai/commit/2bebfddfc70b26752bd0328a50927a28bca92e9e) Thanks [@mikr13](https://github.com/mikr13)! - refactor: update API key handling to save with model and streamline provider settings

## 0.0.6

### Patch Changes

- [`b5a26e2`](https://github.com/superfill-ai/superfill.ai/commit/b5a26e2) Thanks [pratham-kpatil](https://github.com/pratham-kpatil) - fix: delete saved API keys and provider list not updating

- [`f728a8c`](https://github.com/superfill-ai/superfill.ai/commit/f728a8cbecc8930885d3580fa8f4a27d31244c08) Thanks [@mikr13](https://github.com/mikr13)! - feat: top used tags & click-to-add functionality

## 0.0.5

### Patch Changes

- [`e4ddebc`](https://github.com/superfill-ai/superfill.ai/commit/e4ddebca87f78df9077d3708d26bb560868b4cf5) Thanks [@mikr13](https://github.com/mikr13)! - chore: remove release workflow configuration

- [`2b2680f`](https://github.com/superfill-ai/superfill.ai/commit/2b2680f7277ba14999b62ea78228fa133dcfc87b) Thanks [@mikr13](https://github.com/mikr13)! - fix: update release workflow to build and upload extension artifacts with versioning

- [`d7ce326`](https://github.com/superfill-ai/superfill.ai/commit/d7ce3265ffd2396d2206a6b30d7ecdb972d83ac3) Thanks [@mikr13](https://github.com/mikr13)! - fix: add permissions for contents and pull-requests in release workflow

- [`f61164e`](https://github.com/superfill-ai/superfill.ai/commit/f61164eed2b5d15973fcef9b2e606a79295104f6) Thanks [@mikr13](https://github.com/mikr13)! - fix: update README to reflect completion of autopilot mode and add browser native autofill integration

- [`06e291b`](https://github.com/superfill-ai/superfill.ai/commit/06e291bde96fc16c6dbc9fd72463ab52d0ccbd8d) Thanks [@mikr13](https://github.com/mikr13)! - fix: restructure icon definitions in wxt.config.ts for clarity

- [`63fd49a`](https://github.com/superfill-ai/superfill.ai/commit/63fd49abe67b113dd028a84f974d3a4fe2d6bf2e) Thanks [pratham-kpatil](https://github.com/pratham-kpatil) - feat: AI rephrase questions/answers on memory creation

## 0.0.4

### Patch Changes

- feat: add installation listener to open settings and handle missing API key in autofill

## 0.0.3

### Patch Changes

- Initial release with core autofill functionality
- Memory management system with import/export
- Basic settings page for API keys and preferences
- Autofill support with autopilot & preview modes
