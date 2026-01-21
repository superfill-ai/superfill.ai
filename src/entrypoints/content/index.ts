import "./content.css";

import {
  cacheDetectedForms as cacheFormsInMaps,
  collectFrameForms,
  filterAndProcessForms,
  getFrameInfo,
} from "@/entrypoints/content/lib/iframe-handler";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { WebsiteContextExtractor } from "@/lib/context/website-context-extractor";
import { isElementPartOfForm, isMessagingSite } from "@/lib/copies";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import {
  getCaptureSettings,
  isSiteBlocked,
} from "@/lib/storage/capture-settings";
import type {
  AutofillProgress,
  DetectedField,
  DetectedForm,
  DetectFormsResult,
  FieldOpId,
  FormOpId,
  PreviewSidebarPayload,
} from "@/types/autofill";
import { CaptureMemoryManager } from "./components/capture-memory-manager";
import { CaptureService } from "./lib/capture-service";
import { FieldAnalyzer } from "./lib/field-analyzer";
import { getFieldDataTracker } from "./lib/field-data-tracker";
import { handleFill } from "./lib/fill-handler";
import { FillTriggerManager } from "./lib/fill-trigger-manager";
import { FormDetector } from "./lib/form-detector";
import { getFormSubmissionMonitor } from "./lib/form-submission-monitor";
import {
  destroyUIManagers,
  handleShowPreview,
  handleUpdateProgress,
} from "./lib/ui-handler";

const logger = createLogger("content");

const formCache = new Map<FormOpId, DetectedForm>();
const fieldCache = new Map<FieldOpId, DetectedField>();

export default defineContentScript({
  allFrames: true,
  cssInjectionMode: "ui",
  matches: ["<all_urls>"],
  runAt: "document_idle",

  async main(ctx) {
    const frameInfo = getFrameInfo();

    logger.debug("Content script loaded:", frameInfo);

    const fieldAnalyzer = new FieldAnalyzer();
    const formDetector = new FormDetector(fieldAnalyzer);
    const contextExtractor = new WebsiteContextExtractor();
    const fillTriggerManager = new FillTriggerManager();
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

      logger.debug("Stopping memory capture:", reason);

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

      logger.debug("Initializing memory capture for site:", {
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
          formDetector,
          fieldTracker,
          formCache,
          fieldCache,
        );

        unlistenSubmission = submissionMonitor.onSubmission(
          async (submittedFieldOpids) => {
            logger.debug(
              `Form submitted with ${submittedFieldOpids.size} fields`,
              Array.from(submittedFieldOpids),
            );

            try {
              captureSettings = await getCaptureSettings();
              if (!shouldAutoCaptureForCurrentPage(captureSettings)) {
                logger.debug(
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
                logger.debug(
                  "Skipping capture because services were stopped mid-flight",
                );
                return;
              }

              const trackedFields =
                await currentFieldTracker.getCapturedFields();

              if (trackedFields.length === 0) {
                logger.debug("No tracked fields to capture");
                return;
              }

              logger.debug(
                `Processing ${trackedFields.length} tracked fields for capture`,
              );

              const capturedFields =
                currentCaptureService.identifyCaptureOpportunities(
                  trackedFields,
                );

              if (capturedFields.length === 0) {
                logger.debug("No user-entered fields to capture");
                return;
              }

              logger.debug(
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

        logger.debug("Capture settings updated:", {
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

    contentAutofillMessaging.onMessage(
      "collectAllFrameForms",
      async ({ data }: { data: { requestId: string } }) => {
        const result = await collectFrameForms(
          formDetector,
          contextExtractor,
          frameInfo,
        );

        if (result.success) {
          const allForms = formDetector.detectAll();
          const forms = filterAndProcessForms(allForms);
          cacheFormsInMaps(forms, formCache, fieldCache);
        }

        await browser.runtime.sendMessage({
          type: "FRAME_FORMS_DETECTED",
          requestId: data.requestId,
          result,
        });
      },
    );

    contentAutofillMessaging.onMessage(
      "detectForms",
      async (): Promise<DetectFormsResult> => {
        const result = (await collectFrameForms(
          formDetector,
          contextExtractor,
          frameInfo,
        )) as DetectFormsResult;

        if (result.success) {
          const allForms = formDetector.detectAll();
          const forms = filterAndProcessForms(allForms);
          cacheFormsInMaps(forms, formCache, fieldCache);

          logger.debug(
            "Detected forms and fields:",
            forms.length,
            result.totalFields,
          );

          forms.forEach((form, index) => {
            logger.debug(`Form ${index + 1}:`, {
              opid: form.opid,
              name: form.name,
              fieldCount: form.fields.length,
              action: form.action,
              method: form.method,
            });

            form.fields.slice(0, 3).forEach((field) => {
              logger.debug(`  └─ Field ${field.opid}:`, {
                type: field.metadata.fieldType,
                purpose: field.metadata.fieldPurpose,
                labels: {
                  tag: field.metadata.labelTag,
                  aria: field.metadata.labelAria,
                  placeholder: field.metadata.placeholder,
                },
              });
            });

            if (form.fields.length > 3) {
              logger.debug(
                `  └─ ... and ${form.fields.length - 3} more fields`,
              );
            }
          });

          logger.debug("Extracted website context:", result.websiteContext);
        }

        return result;
      },
    );

    contentAutofillMessaging.onMessage(
      "updateProgress",
      async ({ data: progress }: { data: AutofillProgress }) => {
        if (!frameInfo.isMainFrame) {
          logger.debug("Skipping progress UI in iframe");
          return true;
        }

        return handleUpdateProgress(
          progress,
          ctx,
          (fieldOpid) => fieldCache.get(fieldOpid) ?? null,
          (formOpid) => formCache.get(formOpid) ?? null,
        );
      },
    );

    contentAutofillMessaging.onMessage(
      "showPreview",
      async ({ data }: { data: PreviewSidebarPayload }) => {
        if (!frameInfo.isMainFrame) {
          logger.debug("Skipping preview UI in iframe");
          return true;
        }

        return handleShowPreview(
          data,
          ctx,
          (fieldOpid) => fieldCache.get(fieldOpid) ?? null,
          (formOpid) => formCache.get(formOpid) ?? null,
        );
      },
    );

    contentAutofillMessaging.onMessage("fillFields", async ({ data }) => {
      const { fieldsToFill } = data;

      logger.debug(
        `Filling ${fieldsToFill.length} fields in ${frameInfo.isMainFrame ? "main frame" : "iframe"}`,
      );

      await handleFill(fieldsToFill, frameInfo, fieldCache);
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
    });
  },
});
