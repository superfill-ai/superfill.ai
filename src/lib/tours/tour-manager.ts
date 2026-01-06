import { type Config, type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

const logger = createLogger("tour-manager");

export interface TourHistory {
  extensionVersion: string;
  completedTours: string[];
  lastCompletedAt?: string;
}

export class TourManager {
  async getTourHistory(): Promise<TourHistory> {
    const uiSettings = await storage.uiSettings.getValue();
    return {
      extensionVersion: uiSettings.extensionVersion || "0.0.0",
      completedTours: uiSettings.completedTours || [],
      lastCompletedAt: uiSettings.lastTourCompletedAt,
    };
  }

  async hasCompletedTour(tourId: string): Promise<boolean> {
    const history = await this.getTourHistory();
    return history.completedTours.includes(tourId);
  }

  async shouldShowTour(tourId: string, minVersion?: string): Promise<boolean> {
    const history = await this.getTourHistory();

    if (
      minVersion &&
      this.compareVersions(history.extensionVersion, minVersion) >= 0
    ) {
      return false;
    }

    return !history.completedTours.includes(tourId);
  }

  async markTourCompleted(tourId: string): Promise<void> {
    const uiSettings = await storage.uiSettings.getValue();
    const completedTours = [...(uiSettings.completedTours || [])];

    if (!completedTours.includes(tourId)) {
      completedTours.push(tourId);
    }

    await storage.uiSettings.setValue({
      ...uiSettings,
      completedTours,
      lastTourCompletedAt: new Date().toISOString(),
    });

    logger.debug("Tour marked as completed:", tourId);
  }

  async updateExtensionVersion(version: string): Promise<void> {
    const uiSettings = await storage.uiSettings.getValue();
    await storage.uiSettings.setValue({
      ...uiSettings,
      extensionVersion: version,
    });
  }

  createTour(tourId: string, steps: DriveStep[], options?: Partial<Config>) {
    const driverObj = driver({
      showProgress: true,
      showButtons: ["next", "previous", "close"],
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Previous",
      doneBtnText: "Done",
      onDestroyed: () => {
        this.markTourCompleted(tourId);
      },
      ...options,
    });

    driverObj.setSteps(steps);
    return driverObj;
  }

  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split(".").map((p) => parseInt(p, 10) || 0);
    const parts2 = v2.split(".").map((p) => parseInt(p, 10) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;

      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }

    return 0;
  }
}

export const tourManager = new TourManager();
