import type { DriveStep } from "driver.js";
import versionInfo from "@/lib/version.json";

export const CURRENT_APP_TOUR_ID = `app-tour-v${versionInfo.version}`;

export interface TourDefinition {
  id: string;
  minVersion?: string;
  steps: DriveStep[];
}

export const INITIAL_ONBOARDING_TOUR: TourDefinition = {
  id: CURRENT_APP_TOUR_ID,
  steps: [
    {
      element: '[data-tour="settings-tab"]',
      popover: {
        title: "⚙️ Settings",
        description:
          "Configure your autofill behavior and AI provider settings here. You can control autopilot mode, confidence thresholds, and choose your preferred AI model.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: '[data-tour="autofill-enabled"]',
      popover: {
        title: "🤖 Enable Autofill",
        description:
          "Toggle this to enable or disable the autofill feature. When enabled, superfill.ai will automatically suggest form completions based on your stored memories.",
        side: "left",
        align: "start",
      },
    },
    {
      element: '[data-tour="autopilot-mode"]',
      popover: {
        title: "✈️ Autopilot Mode",
        description:
          "When enabled, forms will be filled automatically without showing a preview if the confidence score is above your threshold. Great for frequently used forms!",
        side: "left",
        align: "start",
      },
    },
    {
      element: '[data-tour="confidence-threshold"]',
      popover: {
        title: "🎯 Confidence Threshold",
        description:
          "Set the minimum confidence score (0-1) required for autofill suggestions. Higher values mean more accurate but fewer suggestions.",
        side: "left",
        align: "start",
      },
    },
    {
      element: '[data-tour="inline-trigger"]',
      popover: {
        title: "🔘 Inline Fill Trigger",
        description:
          'Enable this to show a fill button when you focus on input fields. Note: This may conflict with password manager extensions like Bitwarden.<br/><br/><img src="/inline-autofill.png" alt="Inline trigger example" style="width: 100%; border-radius: 8px; margin-top: 8px; border: 1px solid #e5e7eb;" />',
        side: "left",
        align: "start",
      },
    },
    {
      element: '[data-tour="context-menu"]',
      popover: {
        title: "🖱️ Right-Click Context Menu",
        description:
          'When enabled, you can right-click on any page and select "Fill with superfill.ai" to trigger autofill manually.<br/><br/><img src="/right-click-context.png" alt="Context menu example" style="width: 100%; border-radius: 8px; margin-top: 8px; border: 1px solid #e5e7eb;" />',
        side: "left",
        align: "start",
      },
    },
    {
      element: '[data-tour="ai-provider"]',
      popover: {
        title: "🧠 AI Provider",
        description:
          "Choose your AI provider (OpenAI, Anthropic, Google, or Ollama) and configure API keys. The quality of autofill depends on the model you use - latest models recommended!",
        side: "left",
        align: "start",
      },
    },
    {
      element: '[data-tour="memory-tab"]',
      popover: {
        title: "💾 Memory",
        description:
          "This is where all your stored information lives. You can add, edit, or delete memories. Each memory consists of a question and answer pair that the AI uses to fill forms.",
        side: "bottom",
        align: "start",
      },
    },
    {
      popover: {
        title: "🎉 You're All Set!",
        description:
          "That's it! You're ready to start using superfill.ai. Try visiting any form on the web, and superfill.ai will automatically detect fillable fields. Happy autofilling!",
      },
    },
  ],
};

export const tourDefinitions: Record<string, TourDefinition> = {
  [CURRENT_APP_TOUR_ID]: INITIAL_ONBOARDING_TOUR,
};

export function getTourDefinition(tourId: string): TourDefinition | undefined {
  return tourDefinitions[tourId];
}

export function getCurrentAppTour(): TourDefinition {
  return INITIAL_ONBOARDING_TOUR;
}
