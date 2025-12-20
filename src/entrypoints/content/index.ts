import "./content.css";

import {
  cacheDetectedForms as cacheFormsInMaps,
  collectFrameForms,
  filterAndProcessForms,
  getFrameInfo,
} from "@/entrypoints/content/lib/iframe-handler";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { WebsiteContextExtractor } from "@/lib/context/website-context-extractor";
import { createLogger } from "@/lib/logger";
import type {
  AutofillProgress,
  DetectedField,
  DetectedForm,
  DetectFormsResult,
  FieldOpId,
  FormOpId,
  PreviewSidebarPayload,
} from "@/types/autofill";
import { FillTriggerManager } from "./components/fill-trigger-manager";
import { CaptureService } from "./lib/capture-service";
import { FieldAnalyzer } from "./lib/field-analyzer";
import { getFieldDataTracker } from "./lib/field-data-tracker";
import { handleFill } from "./lib/fill-handler";
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
let fillTriggerManager: FillTriggerManager | null = null;

export default defineContentScript({
  allFrames: true,
  cssInjectionMode: "ui",
  matches: ["<all_urls>"],
  runAt: "document_idle",

  async main(ctx) {
    const frameInfo = getFrameInfo();

    logger.info("Content script loaded:", frameInfo);

    const fieldAnalyzer = new FieldAnalyzer();
    const formDetector = new FormDetector(fieldAnalyzer);
    const contextExtractor = new WebsiteContextExtractor();
    const fieldTracker = await getFieldDataTracker();
    const submissionMonitor = getFormSubmissionMonitor();
    const captureService = new CaptureService();

    submissionMonitor.start();

    logger.info("Form submission monitor started");

    await captureService.initializeAutoTracking(
      formDetector,
      fieldTracker,
      formCache,
      fieldCache,
    );
    fillTriggerManager = new FillTriggerManager();
    fillTriggerManager.initialize();

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

          logger.info(
            "Detected forms and fields:",
            forms.length,
            result.totalFields,
          );

          forms.forEach((form, index) => {
            logger.info(`Form ${index + 1}:`, {
              opid: form.opid,
              name: form.name,
              fieldCount: form.fields.length,
              action: form.action,
              method: form.method,
            });

            form.fields.slice(0, 3).forEach((field) => {
              logger.info(`  └─ Field ${field.opid}:`, {
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
              logger.info(`  └─ ... and ${form.fields.length - 3} more fields`);
            }
          });

          logger.info("Extracted website context:", result.websiteContext);
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

      logger.info(
        `Filling ${fieldsToFill.length} fields in ${frameInfo.isMainFrame ? "main frame" : "iframe"}`,
      );

      handleFill(fieldsToFill, frameInfo, fieldCache);
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

    submissionMonitor.onSubmission(async (submittedFieldOpids) => {
      logger.info(
        `Form submitted with ${submittedFieldOpids.size} fields`,
        Array.from(submittedFieldOpids),
      );

      try {
        const trackedFields = await fieldTracker.getCapturedFields();

        if (trackedFields.length === 0) {
          logger.info("No tracked fields to capture");
          return;
        }

        logger.info(
          `Processing ${trackedFields.length} tracked fields for capture`,
        );

        const capturedFields =
          captureService.identifyCaptureOpportunities(trackedFields);

        if (capturedFields.length === 0) {
          logger.info("No user-entered fields to capture");
          return;
        }

        logger.info(`Saving ${capturedFields.length} captured fields directly`);

        const result = await contentAutofillMessaging.sendMessage(
          "saveCapturedMemories",
          {
            capturedFields,
          },
        );

        if (result.success) {
          logger.info(
            `Successfully saved ${result.savedCount} memories from form submission`,
          );
          await fieldTracker.clearSession();
        }
      } catch (error) {
        logger.error("Error processing form submission:", error);
      }
    });

    ctx.onInvalidated(() => {
      fieldTracker.dispose();
      submissionMonitor.dispose();
    });
  },
});
