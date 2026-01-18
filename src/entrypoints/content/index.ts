import {
  cacheDetectedForms as cacheFormsInMaps,
  collectFrameForms,
  filterAndProcessForms,
  getFrameInfo,
} from "@/entrypoints/content/lib/iframe-handler";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { WebsiteContextExtractor } from "@/lib/context/website-context-extractor";
import { isMessagingSite } from "@/lib/copies";
import { createLogger } from "@/lib/logger";
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
import "./content.css";
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

    const WEBSITE_URL =
      import.meta.env.WXT_WEBSITE_URL || "https://superfill.ai";
    const isWebappDomain =
      window.location.origin === WEBSITE_URL ||
      window.location.origin === new URL(WEBSITE_URL).origin;

    if (isWebappDomain) {
      window.addEventListener("message", (event) => {
        if (event.data?.type === "SUPERFILL_AUTH_SUCCESS") {
          const { access_token, refresh_token, user } = event.data;

          if (access_token && refresh_token) {
            browser.runtime.sendMessage({
              type: "SUPERFILL_AUTH_SUCCESS",
              access_token,
              refresh_token,
              user,
              timestamp: Date.now(),
            });
            logger.debug("Auth tokens forwarded to extension", {
              hasAccessToken: !!access_token,
              hasRefreshToken: !!refresh_token,
              userId: user?.id,
            });
          } else {
            logger.error("Auth message missing tokens");
          }
        }
      });

      logger.debug("Auth message listener registered for webapp");
    }

    const fieldAnalyzer = new FieldAnalyzer();
    const formDetector = new FormDetector(fieldAnalyzer);
    const contextExtractor = new WebsiteContextExtractor();
    const fillTriggerManager = new FillTriggerManager();
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    let captureSettings: Awaited<ReturnType<typeof getCaptureSettings>>;

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

    const isAutoCaptureBlocked =
      isSiteBlocked(hostname, captureSettings) ||
      isMessagingSite(hostname, pathname);
    let fieldTracker: Awaited<ReturnType<typeof getFieldDataTracker>> | null =
      null;
    let submissionMonitor: ReturnType<typeof getFormSubmissionMonitor> | null =
      null;
    let captureService: CaptureService | null = null;
    let captureMemoryManager: CaptureMemoryManager | null = null;

    if (
      captureSettings.enabled &&
      !isAutoCaptureBlocked &&
      frameInfo.isMainFrame
    ) {
      logger.debug("Initializing memory capture for site:", hostname);
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
    } else {
      logger.debug("Memory capture disabled for site:", {
        hostname,
        enabled: captureSettings.enabled,
        isAutoCaptureBlocked,
        isMainFrame: frameInfo.isMainFrame,
      });
    }

    await fillTriggerManager.initialize();

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

    if (
      submissionMonitor &&
      fieldTracker &&
      captureService &&
      captureMemoryManager
    ) {
      submissionMonitor.onSubmission(async (submittedFieldOpids) => {
        logger.debug(
          `Form submitted with ${submittedFieldOpids.size} fields`,
          Array.from(submittedFieldOpids),
        );

        try {
          const trackedFields = await fieldTracker.getCapturedFields();

          if (trackedFields.length === 0) {
            logger.debug("No tracked fields to capture");
            return;
          }

          logger.debug(
            `Processing ${trackedFields.length} tracked fields for capture`,
          );

          const capturedFields =
            captureService.identifyCaptureOpportunities(trackedFields);

          if (capturedFields.length === 0) {
            logger.debug("No user-entered fields to capture");
            return;
          }

          logger.debug(
            `Showing capture prompt for ${capturedFields.length} fields`,
          );

          await captureMemoryManager.show(ctx, capturedFields);
        } catch (error) {
          logger.error("Error processing form submission:", error);
        }
      });
    }

    ctx.onInvalidated(() => {
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
