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

export const versionUpdates: Record<string, VersionUpdate> = {};

export function getUpdateForVersion(
  version: string,
): VersionUpdate | undefined {
  return versionUpdates[version];
}

export function hasUpdateTour(currentVersion: string): boolean {
  return versionUpdates[currentVersion] !== undefined;
}
