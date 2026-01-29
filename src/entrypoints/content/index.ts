import "./content.css";

import { getFrameInfo } from "@/entrypoints/content/lib/iframe-handler";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { WebsiteContextExtractor } from "@/lib/context/website-context-extractor";
import { isElementPartOfForm, isMessagingSite } from "@/lib/copies";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import {
  getCaptureSettings,
  isSiteBlocked,
} from "@/lib/storage/capture-settings";
import type { AutofillProgress, PreviewSidebarPayload } from "@/types/autofill";
import { CaptureMemoryManager } from "./components/capture-memory-manager";
import { RightClickGuideManager } from "./components/right-click-guide-manager";
import { CaptureService } from "./lib/capture-service";
import { FieldAnalyzer } from "./lib/field-analyzer";
import { getFieldDataTracker } from "./lib/field-data-tracker";
import { handleFill } from "./lib/fill-handler";
import { FillTriggerManager } from "./lib/fill-trigger-manager";
import { FormDetectionService } from "./lib/form-detection-service";
import { getFormSubmissionMonitor } from "./lib/form-submission-monitor";
import {
  destroyUIManagers,
  handleShowPreview,
  handleUpdateProgress,
} from "./lib/ui-handler";

const logger = createLogger("content");

let formDetectionService: FormDetectionService;

export default defineContentScript({
  allFrames: true,
  cssInjectionMode: "ui",
  matches: ["<all_urls>"],
  runAt: "document_idle",

  async main(ctx) {
    const frameInfo = getFrameInfo();

    logger.info("Content script loaded:", frameInfo);

    const fieldAnalyzer = new FieldAnalyzer();
    const contextExtractor = new WebsiteContextExtractor();
    const fillTriggerManager = new FillTriggerManager();

    formDetectionService = new FormDetectionService(
      fieldAnalyzer,
      contextExtractor,
    );
    formDetectionService.initialize();

    let captureSettings: Awaited<ReturnType<typeof getCaptureSettings>>;

    const shouldAutoCaptureForCurrentPage = (
      settings: Awaited<ReturnType<typeof getCaptureSettings>>,
    ): boolean => {
      const { hostname, pathname } = window.location;

      if (!frameInfo.isMainFrame) return false;
      if (!settings.enabled) return false;
      if (isMessagingSite(hostname, pathname)) return false;

      return !isSiteBlocked(hostname, settings);
    };

    try {
      captureSettings = await getCaptureSettings();
    } catch (error) {
      logger.error(
        "Failed to load capture settings, disabling capture:",
        error,
      );
      captureSettings = {
        enabled: false,
        blockedDomains: [],
        neverAskSites: [],
      };
    }

    let fieldTracker: Awaited<ReturnType<typeof getFieldDataTracker>> | null =
      null;
    let submissionMonitor: ReturnType<typeof getFormSubmissionMonitor> | null =
      null;
    let captureService: CaptureService | null = null;
    let captureMemoryManager: CaptureMemoryManager | null = null;
    let unwatchCaptureSettings: (() => void) | null = null;
    let unlistenSubmission: (() => void) | null = null;

    const stopAutoCapture = async (reason: string): Promise<void> => {
      if (!frameInfo.isMainFrame) return;

      if (!submissionMonitor && !fieldTracker && !captureService) return;

      logger.info("Stopping memory capture:", reason);

      try {
        await captureMemoryManager?.hide();
      } catch {}

      try {
        unlistenSubmission?.();
      } catch {}
      unlistenSubmission = null;

      try {
        submissionMonitor?.dispose();
      } catch {}
      submissionMonitor = null;

      if (fieldTracker) {
        try {
          await fieldTracker.clearSession();
        } catch {}
      }
      fieldTracker = null;

      try {
        captureService?.dispose();
      } catch {}
      captureService = null;

      captureMemoryManager = null;
    };

    const startAutoCapture = async (reason: string): Promise<void> => {
      const { hostname, pathname } = window.location;
      if (!frameInfo.isMainFrame) return;

      if (!shouldAutoCaptureForCurrentPage(captureSettings)) {
        return;
      }

      if (
        submissionMonitor &&
        fieldTracker &&
        captureService &&
        captureMemoryManager
      ) {
        return;
      }

      logger.info("Initializing memory capture for site:", {
        hostname,
        pathname,
        reason,
      });

      try {
        fieldTracker = await getFieldDataTracker();
        submissionMonitor = getFormSubmissionMonitor();
        captureService = new CaptureService();
        captureMemoryManager = new CaptureMemoryManager();

        submissionMonitor.start();
        await captureService.initializeAutoTracking(
          formDetectionService,
          fieldTracker,
          submissionMonitor,
        );

        unlistenSubmission = submissionMonitor.onSubmission(
          async (submittedFieldOpids) => {
            logger.info(
              `Form submitted with ${submittedFieldOpids.size} fields`,
              Array.from(submittedFieldOpids),
            );

            try {
              captureSettings = await getCaptureSettings();
              if (!shouldAutoCaptureForCurrentPage(captureSettings)) {
                logger.info(
                  "Skipping capture due to updated settings (disabled/blocked)",
                );
                return;
              }

              const currentFieldTracker = fieldTracker;
              const currentCaptureService = captureService;
              const currentCaptureMemoryManager = captureMemoryManager;

              if (
                !currentFieldTracker ||
                !currentCaptureService ||
                !currentCaptureMemoryManager
              ) {
                logger.info(
                  "Skipping capture because services were stopped mid-flight",
                );
                return;
              }

              const trackedFields =
                await currentFieldTracker.getCapturedFields();

              if (trackedFields.length === 0) {
                logger.info("No tracked fields to capture");
                return;
              }

              logger.info(
                `Processing ${trackedFields.length} tracked fields for capture`,
              );

              const capturedFields =
                currentCaptureService.identifyCaptureOpportunities(
                  trackedFields,
                );

              if (capturedFields.length === 0) {
                logger.info("No user-entered fields to capture");
                return;
              }

              logger.info(
                `Showing capture prompt for ${capturedFields.length} fields`,
              );

              await currentCaptureMemoryManager.show(ctx, capturedFields);
            } catch (error) {
              logger.error("Error processing form submission:", error);
            }
          },
        );
      } catch (error) {
        logger.error("Failed to start auto capture:", error);
        await stopAutoCapture("initialization failure");
      }
    };

    const syncAutoCaptureFromSettings = async (
      reason: string,
    ): Promise<void> => {
      if (!frameInfo.isMainFrame) return;

      if (shouldAutoCaptureForCurrentPage(captureSettings)) {
        await startAutoCapture(reason);
      } else {
        await stopAutoCapture(reason);
      }
    };

    await syncAutoCaptureFromSettings("initial settings");

    unwatchCaptureSettings = storage.captureSettings.watch(() => {
      if (!frameInfo.isMainFrame) return;

      const { hostname } = window.location;

      void (async () => {
        try {
          captureSettings = await getCaptureSettings();
        } catch (error) {
          logger.error(
            "Failed to reload capture settings after change, disabling capture:",
            error,
          );
          captureSettings = {
            enabled: false,
            blockedDomains: [],
            neverAskSites: [],
          };
        }

        logger.info("Capture settings updated:", {
          hostname,
          enabled: captureSettings.enabled,
          isBlocked: isSiteBlocked(hostname, captureSettings),
          neverAskSitesCount: captureSettings.neverAskSites.length,
        });

        await syncAutoCaptureFromSettings("settings changed");
      })();
    });

    try {
      await fillTriggerManager.initialize(isElementPartOfForm);
    } catch (error) {
      logger.error("Failed to initialize FillTriggerManager", error);
    }

    const rightClickGuideManager = new RightClickGuideManager();

    const handleInputClick = async (event: Event) => {
      if (!frameInfo.isMainFrame) return;

      const target = event.target as HTMLElement;

      const isFormField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (!isFormField) return;

      if (!formDetectionService.hasCachedForms()) {
        try {
          await formDetectionService.detectFormsInCurrentFrame();
        } catch (error) {
          logger.error("Error detecting forms for guide:", error);
          return;
        }
      }

      if (!formDetectionService.hasCachedForms()) {
        return;
      }
      try {
        const aiSettings = await storage.aiSettings.getValue();
        if (!aiSettings.contextMenuEnabled) {
          return;
        }
      } catch (error) {
        logger.error("Error checking AI settings:", error);
        return;
      }

      const hostname = window.location.hostname;
      const pathname = window.location.pathname;

      if (isMessagingSite(hostname, pathname)) return;
      if (rightClickGuideManager.isVisible) return;

      try {
        await rightClickGuideManager.show(ctx);
      } catch (error) {
        logger.error("Error showing right-click guide:", error);
      }
    };

    document.addEventListener("click", handleInputClick, { capture: true });

    const cleanupGuideListener = () => {
      document.removeEventListener("click", handleInputClick, {
        capture: true,
      });
      rightClickGuideManager.destroy();
    };

    contentAutofillMessaging.onMessage(
      "updateProgress",
      async ({ data: progress }: { data: AutofillProgress }) => {
        if (!frameInfo.isMainFrame) {
          logger.info("Skipping progress UI in iframe");
          return true;
        }

        return handleUpdateProgress(
          progress,
          ctx,
          (fieldOpid) => formDetectionService.getCachedField(fieldOpid),
          (formOpid) => formDetectionService.getCachedForm(formOpid),
        );
      },
    );

    contentAutofillMessaging.onMessage(
      "showPreview",
      async ({ data }: { data: PreviewSidebarPayload }) => {
        if (!frameInfo.isMainFrame) {
          logger.info("Skipping preview UI in iframe");
          return true;
        }

        return handleShowPreview(
          data,
          ctx,
          (fieldOpid) => formDetectionService.getCachedField(fieldOpid),
          (formOpid) => formDetectionService.getCachedForm(formOpid),
        );
      },
    );

    contentAutofillMessaging.onMessage("fillFields", async ({ data }) => {
      const { fieldsToFill } = data;

      logger.info(
        `Filling ${fieldsToFill.length} fields in ${frameInfo.isMainFrame ? "main frame" : "iframe"}`,
      );

      await handleFill(fieldsToFill, frameInfo, formDetectionService);
    });

    contentAutofillMessaging.onMessage("closePreview", async () => {
      if (!frameInfo.isMainFrame) {
        return true;
      }

      destroyUIManagers();

      if (fillTriggerManager) {
        fillTriggerManager.destroy();
      }

      return true;
    });

    ctx.onInvalidated(() => {
      try {
        formDetectionService.dispose();
      } catch {}

      try {
        unwatchCaptureSettings?.();
      } catch {}
      unwatchCaptureSettings = null;

      try {
        unlistenSubmission?.();
      } catch {}
      unlistenSubmission = null;

      if (fieldTracker) {
        fieldTracker.dispose();
      }
      if (submissionMonitor) {
        submissionMonitor.dispose();
      }
      if (captureService) {
        captureService.dispose();
      }
      if (captureMemoryManager) {
        captureMemoryManager.hide();
      }

      try {
        cleanupGuideListener();
      } catch {}
    });
  },
});
