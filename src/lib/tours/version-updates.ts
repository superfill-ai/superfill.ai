import type { DriveStep } from "driver.js";

/**
 * Version-specific update tours
 *
 * These are SEPARATE from the main app tour and only shown ONCE after updates.
 * Main app tour (CURRENT_APP_TOUR_ID) is always kept current and shown on manual trigger.
 *
 * Update tours should:
 * - Only highlight NEW features added in that version
 * - Be shorter than the full app tour
 * - Use tour ID format: "update-highlights-v{version}"
 * - NOT be shown when user manually triggers tour
 *
 * Example configuration:
 * ```typescript
 * "0.3.0": {
 *   version: "0.3.0",
 *   tourId: "update-highlights-v0.3.0",
 *   changes: [
 *     "New memory export feature",
 *     "Improved AI model selection UI"
 *   ],
 *   steps: [
 *     {
 *       element: '[data-tour="export-btn"]',
 *       popover: {
 *         title: "🎉 New: Export Memories",
 *         description: "You can now export your memories as JSON or CSV!",
 *       }
 *     }
 *   ]
 * }
 * ```
 */

export interface VersionUpdate {
  version: string;
  tourId: string;
  changes: string[];
  steps: DriveStep[];
}

export const versionUpdates: Record<string, VersionUpdate> = {
  "0.2.2": {
    version: "0.2.2",
    tourId: "update-highlights-v0.2.2",
    changes: [
      "Automatic memory capture from form submissions",
      "New capture settings to control when and where to save memories",
      "Smart deduplication to avoid saving duplicate information",
    ],
    steps: [
      {
        popover: {
          title: "🎉 What's New in v0.2.2",
          description:
            "Superfill can now automatically capture form data you fill and prompt you to save it as memories! Let's see how it works.",
        },
      },
      {
        element: '[data-tour="capture-settings"]',
        popover: {
          title: "📋 Capture Settings",
          description:
            "Control automatic memory capture with new settings. You can enable/disable capture and manage sites where you don't want to be asked.",
          side: "bottom",
        },
      },
      {
        popover: {
          title: "✨ How It Works",
          description:
            "When you submit a form, Superfill detects the fields you filled and shows a popup asking if you want to save them as memories. You can save all, dismiss, or choose to never ask for that specific site.",
        },
      },
      {
        popover: {
          title: "🧠 Smart Deduplication",
          description:
            "Don't worry about duplicates! Superfill automatically detects similar questions and updates existing memories instead of creating duplicates.",
        },
      },
    ],
  },
};

export function getUpdateForVersion(
  version: string,
): VersionUpdate | undefined {
  return versionUpdates[version];
}

export function hasUpdateTour(currentVersion: string): boolean {
  return versionUpdates[currentVersion] !== undefined;
}
