---
"superfill.ai": patch
---

feat(autofill): Implement user choice for AI-rephrased memories

This commit enhances the autofill preview by allowing users to choose between the AI-rephrased suggestion and their original stored memory.

- **UI Toggle**: The preview component now includes a toggle button to switch between the "AI Rephrased Memory" and "Original Memory" views. The UI dynamically updates labels and styles to reflect the current selection.

- **Manual Fill**: The manual "Fill Selected" action now respects the user's choice. The `preview-manager` has been updated to fill the form with the value selected in the UI (original or rephrased).

- **Autopilot Logic**: The `autopilot-manager` is updated to consistently use the `rephrasedValue` when available, ensuring predictable behavior in automated mode.
