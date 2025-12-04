import "./content.css";

import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { CaptureService } from "@/lib/autofill/capture-service";
import { MIN_FIELD_QUALITY } from "@/lib/autofill/constants";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import {
  createFilterStats,
  getPrimaryLabel,
  hasAnyLabel,
  hasValidContext,
  scoreField,
} from "@/lib/autofill/field-quality";
import { WebsiteContextExtractor } from "@/lib/context/website-context-extractor";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type {
  AutofillProgress,
  DetectedField,
  DetectedForm,
  DetectedFormSnapshot,
  DetectFormsResult,
  FieldMapping,
  FieldOpId,
  FormOpId,
  PreviewSidebarPayload,
} from "@/types/autofill";
import { AutopilotManager } from "./components/autopilot-manager";
import { PreviewSidebarManager } from "./components/preview-manager";
import { FieldAnalyzer } from "./lib/field-analyzer";
import { getFieldDataTracker } from "./lib/field-data-tracker";
import { FormDetector } from "./lib/form-detector";
import { getFormSubmissionMonitor } from "./lib/form-submission-monitor";

const logger = createLogger("content");

const formCache = new Map<FormOpId, DetectedForm>();
const fieldCache = new Map<FieldOpId, DetectedField>();
let serializedFormCache: DetectedFormSnapshot[] = [];
let previewManager: PreviewSidebarManager | null = null;
let autopilotManager: AutopilotManager | null = null;

const cacheDetectedForms = (forms: DetectedForm[]) => {
  formCache.clear();
  fieldCache.clear();

  for (const form of forms) {
    formCache.set(form.opid, form);

    for (const field of form.fields) {
      fieldCache.set(field.opid, field);
    }
  }
};

const serializeForms = (forms: DetectedForm[]): DetectedFormSnapshot[] =>
  forms.map((form) => ({
    opid: form.opid,
    action: form.action,
    method: form.method,
    name: form.name,
    fields: form.fields.map((field) => {
      const { rect, ...metadata } = field.metadata;

      return {
        opid: field.opid,
        formOpid: field.formOpid,
        metadata: {
          ...metadata,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
          } as DOMRectInit,
        },
      } satisfies DetectedFormSnapshot["fields"][number];
    }),
  }));

const ensurePreviewManager = (ctx: ContentScriptContext) => {
  if (!previewManager) {
    previewManager = new PreviewSidebarManager({
      ctx,
      getFieldMetadata: (fieldOpid) => fieldCache.get(fieldOpid) ?? null,
      getFormMetadata: (formOpid) => formCache.get(formOpid) ?? null,
    });
  }

  return previewManager;
};

const ensureAutopilotManager = (ctx: ContentScriptContext) => {
  if (!autopilotManager) {
    autopilotManager = new AutopilotManager({
      ctx,
      getFieldMetadata: (fieldOpid) => fieldCache.get(fieldOpid) ?? null,
      getFormMetadata: (formOpid) => formCache.get(formOpid) ?? null,
    });
  }

  return autopilotManager;
};

const initializeAutoTracking = async (
  formDetector: FormDetector,
  fieldTracker: ReturnType<typeof getFieldDataTracker>,
) => {
  try {
    const allForms = formDetector.detectAll();

    if (allForms.length === 0) {
      logger.info("No forms detected for auto-tracking");
      return;
    }

    cacheDetectedForms(allForms);
    serializedFormCache = serializeForms(allForms);

    const totalFields = allForms.reduce(
      (sum, form) => sum + form.fields.length,
      0,
    );

    logger.info(
      `Auto-tracking initialized: ${allForms.length} forms, ${totalFields} fields`,
    );

    const sessionId = crypto.randomUUID();

    await fieldTracker.startTracking(
      window.location.href,
      document.title,
      sessionId,
    );

    const emptyMappings = new Map<FieldOpId, FieldMapping>();
    fieldTracker.attachFieldListeners(
      serializedFormCache.flatMap((f) => f.fields),
      emptyMappings,
    );

    logger.info("Auto-tracking listeners attached for form submission capture");
  } catch (error) {
    logger.error("Failed to initialize auto-tracking:", error);
  }
};

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  runAt: "document_idle",

  async main(ctx) {
    logger.info("Content script loaded on:", window.location.href);

    const fieldAnalyzer = new FieldAnalyzer();
    const formDetector = new FormDetector(fieldAnalyzer);
    const contextExtractor = new WebsiteContextExtractor();
    const fieldTracker = getFieldDataTracker();
    const submissionMonitor = getFormSubmissionMonitor();
    const captureService = new CaptureService();

    submissionMonitor.start();

    logger.info("Form submission monitor started");

    await initializeAutoTracking(formDetector, fieldTracker);

    contentAutofillMessaging.onMessage(
      "detectForms",
      async (): Promise<DetectFormsResult> => {
        try {
          const allForms = formDetector.detectAll();
          const stats = createFilterStats();

          const forms = allForms
            .map((form) => {
              const seenLabels = new Set<string>();

              const filteredFields = form.fields.filter((field) => {
                const quality = scoreField(field.metadata);
                stats.total++;

                if (quality < MIN_FIELD_QUALITY) {
                  stats.filtered++;
                  if (
                    field.metadata.fieldPurpose === "unknown" &&
                    !hasAnyLabel(field.metadata) &&
                    !hasValidContext(field.metadata)
                  ) {
                    stats.reasons.unknownUnlabeled++;
                    logger.debug(
                      `Filtered field ${field.opid}: unknown purpose, no labels, no valid context, low quality score ${quality.toFixed(2)}`,
                    );
                  } else {
                    stats.reasons.noQuality++;
                    logger.debug(
                      `Filtered field ${field.opid}: low quality score ${quality.toFixed(2)}`,
                    );
                  }
                  return false;
                }

                const primaryLabel = getPrimaryLabel(field.metadata);

                if (primaryLabel) {
                  const normalizedLabel = primaryLabel.toLowerCase().trim();
                  if (seenLabels.has(normalizedLabel)) {
                    stats.filtered++;
                    stats.reasons.duplicate++;
                    logger.debug(
                      `Filtered field ${field.opid}: duplicate label "${primaryLabel}"`,
                    );
                    return false;
                  }
                  seenLabels.add(normalizedLabel);
                }

                return true;
              });

              return {
                ...form,
                fields: filteredFields,
              };
            })
            .filter((form) => form.fields.length > 0);

          logger.debug(
            `Field filtering: ${stats.total} detected, ${stats.filtered} filtered, ${stats.total - stats.filtered} kept`,
          );
          logger.debug(
            `Filter reasons: ${stats.reasons.noQuality} low quality, ${stats.reasons.unknownUnlabeled} unknown+unlabeled, ${stats.reasons.duplicate} duplicates`,
          );

          cacheDetectedForms(forms);
          serializedFormCache = serializeForms(forms);

          const totalFields = forms.reduce(
            (sum, form) => sum + form.fields.length,
            0,
          );

          logger.info("Detected forms and fields:", forms.length, totalFields);

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

          const websiteContext = contextExtractor.extract();
          logger.info("Extracted website context:", websiteContext);

          logger.info(
            `Detected ${forms.length} forms with ${totalFields} total fields`,
          );

          return {
            success: true,
            forms: serializedFormCache,
            totalFields,
            websiteContext,
          };
        } catch (error) {
          logger.error("Error detecting forms:", error);
          return {
            success: false,
            forms: [],
            totalFields: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    );

    contentAutofillMessaging.onMessage(
      "updateProgress",
      async ({ data: progress }: { data: AutofillProgress }) => {
        try {
          const settingStore = await storage.aiSettings.getValue();

          if (settingStore.autopilotMode) {
            if (
              progress.state === "showing-preview" ||
              progress.state === "completed"
            ) {
              return true;
            }
            const manager = ensureAutopilotManager(ctx);
            await manager.showProgress(progress);
            return true;
          } else {
            const manager = ensurePreviewManager(ctx);
            await manager.showProgress(progress);
            return true;
          }
        } catch (error) {
          logger.error("Error updating progress:", error);
          return false;
        }
      },
    );

    contentAutofillMessaging.onMessage(
      "showPreview",
      async ({ data }: { data: PreviewSidebarPayload }) => {
        logger.info("Received preview payload from background", {
          mappings: data.mappings.length,
          forms: data.forms.length,
        });

        const settingStore = await storage.aiSettings.getValue();
        let manager: PreviewSidebarManager | AutopilotManager;

        if (settingStore.autopilotMode) {
          manager = ensureAutopilotManager(ctx);
        } else {
          manager = ensurePreviewManager(ctx);
        }

        try {
          await fieldTracker.startTracking(
            window.location.href,
            document.title,
            data.sessionId,
          );

          const mappingLookup = new Map(
            data.mappings.map((m) => [m.fieldOpid as FieldOpId, m]),
          );
          fieldTracker.attachFieldListeners(
            serializedFormCache.flatMap((f) => f.fields),
            mappingLookup,
          );

          logger.info("Field tracker initialized and listeners attached");

          if (
            settingStore.autopilotMode &&
            manager instanceof AutopilotManager
          ) {
            logger.info("Autopilot manager created, attempting to show...");

            await manager.processAutofillData(
              data.mappings,
              settingStore.confidenceThreshold,
              data.sessionId,
            );

            logger.info("Autopilot manager processed data successfully");
          } else if (manager instanceof PreviewSidebarManager) {
            logger.info("Preview manager created, attempting to show...");

            await manager.show({
              payload: data,
            });

            logger.info("Preview shown successfully");
          }
          return true;
        } catch (error) {
          logger.error("Error showing preview:", {
            error,
            errorMessage: error instanceof Error ? error.message : "Unknown",
            errorStack: error instanceof Error ? error.stack : undefined,
          });
          await manager.showProgress({
            state: "failed",
            message: "Auto-fill failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          throw error;
        }
      },
    );

    contentAutofillMessaging.onMessage("closePreview", async () => {
      if (previewManager) {
        previewManager.destroy();
      }

      if (autopilotManager) {
        autopilotManager.hide();
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

    // Temporarily show contentAutofill permanent UI for testing
    // const manager = ensureAutopilotManager(ctx);
    // await manager.showProgress({
    //   state: "detecting",
    //   message: "Detecting forms on the page...",
    //   fieldsDetected: 5,
    //   fieldsMatched: 2,
    // });
    // const manager = ensurePreviewManager(ctx);
    // manager.showProgress({
    //   state: "detecting",
    //   message: "Detecting forms on the page...",
    // });
    // setTimeout(() => {
    //   manager.show({
    //     payload: {
    //       mappings: [
    //         {
    //           fieldOpid: "__0",
    //           memoryId: "019a1f41-c8df-7283-9885-e12d8eb4ca41",
    //           value: "Mihir K",
    //           confidence: 0.95,
    //           reasoning: "Direct name match with validation",
    //           alternativeMatches: [],
    //           autoFill: true,
    //         },
    //         {
    //           fieldOpid: "__1",
    //           memoryId: "019a111b-3f05-703a-b7bf-41c3abe89457",
    //           value: "someone@dummy.com",
    //           confidence: 0.95,
    //           reasoning: "Direct email match with validation",
    //           alternativeMatches: [],
    //           autoFill: true,
    //         },
    //         {
    //           fieldOpid: "__2",
    //           memoryId: "019a1f75-9829-7307-a186-0311aef8a51c",
    //           value: "Earth - 100011",
    //           confidence: 0.85,
    //           reasoning:
    //             "The field is for a home address, which aligns well with Memory 3 that specifically addresses location-related information.",
    //           alternativeMatches: [
    //             {
    //               memoryId: "019a29b0-c7fa-727e-92d2-dad1c0cf1695",
    //               value:
    //                 "# John Doe\n\n**Frontend Developer**\nAmsterdam, Netherlands | johndoe@example.com | +31 6 12345678 | (https://linkedin.com/in/johndoe)\\[LinkedIn]\n\n***\n\n## Experience\n\n**Frontend Developer at Cloudify Solutions**\n*Amsterdam, Netherlands | June 2022 – Present | 1 year 6 months*\n\n* Developed and maintained web-based applications using React, JavaScript, and TypeScript.\n* Migrated a complex AngularJS application to React for enhanced maintainability and user experience.\n* Created reusable UI components, improving consistency across the product and reducing development time for new features.\n* Collaborated closely with the UX/UI team to deliver engaging and responsive interfaces.\n\n**Junior Frontend Developer at TechSphere**\n*Berlin, Germany | June 2021 – May 2022 | 1 year*\n\n* Contributed to the development of a new customer portal, implementing a fresh design using Bootstrap and React.\n* Assisted with the integration of RESTful API services for better data visualization in dashboards.\n* Worked in a Scrum environment, closely with designers and backend developers to meet client requirements.\n\n***\n\n## Projects\n\n**TaskBuddy**\n*A task management web app built to help users organize their daily activities efficiently.*\n\n* Developed using Vue.js and Tailwind CSS for a responsive and clean user experience.\n* Implemented offline capabilities using IndexedDB for a smoother experience without an internet connection.\n* Enhanced the user experience with intuitive UI and task categorization features.\n\n**DevBoard**\n*An open-source project management dashboard application for small teams to track tasks and goals.*\n\n* Built with React, TypeScript, and MaterialUI, providing a seamless experience.\n* Integrated Redux for state management and Axios to handle API requests.\n* Utilized Jest for unit tests to ensure code quality and reliability.\n\n***\n\n## Skills\n\n* **Programming Languages**: JavaScript, TypeScript, HTML, CSS\n* **Frameworks**: React, Vue.js, Tailwind CSS, Bootstrap, MaterialUI\n* **Tools**: Git, VS Code, Jira, Webpack\n\n***\n\n## Education\n\n**Bachelor of Science in Computer Science**\n*Berlin University of Technology | 2017 – 2021*\n\n***\n\n## Languages\n\n* **English**: Fluent\n* **German**: Intermediate\n* **Dutch**: Basic\n\n***\n\n## Certificates\n\n* **Frontend Developer Certification** - FreeCodeCamp\n* **JavaScript Specialist** - W3Schools\n\n***\n\n## Interests\n\n* **Hobbies**: Exploring new JavaScript frameworks, playing guitar, running, and photography.",
    //               confidence: 0.75,
    //             },
    //             {
    //               memoryId: "019a2eb7-fb67-706c-9ef0-6ec48825749a",
    //               value:
    //                 "Sample Cover Letter\n[Your Name]\n[Your Address]\n[City, State, ZIP Code]\n[Your Email Address]\n[Your Phone Number]\n[Date]\n[Hiring Manager's Name]\n[Company Name]\n[Company Address]\n[City, State, ZIP Code]\nSubject: Application for [Job Title]\nDear [Hiring Manager's Name],\nI am excited to apply for the [Job Title] position at [Company Name], as advertised on [where you found the job posting]. With my [specific skills or experience], I am confident in my ability to contribute to your team and help achieve [specific company goals or values].\nIn my previous role as [Your Previous Job Title] at [Your Previous Company], I successfully [mention a key achievement or responsibility that aligns with the job you're applying for]. This experience allowed me to develop [specific skills or qualities], which I believe will be valuable in this role.\nWhat excites me most about [Company Name] is [mention something specific about the company, such as its mission, culture, or recent achievements]. I am particularly drawn to [specific aspect of the job or company] because it aligns with my passion for [related field or value].\nI would welcome the opportunity to bring my [specific skills or qualities] to [Company Name] and contribute to your ongoing success. I have attached my resume for your review and would be delighted to discuss how my background, skills, and enthusiasm align with your needs.\nThank you for considering my application. I look forward to the possibility of contributing to your team and would be happy to provide further information or schedule an interview at your convenience.\nWarm regards,\n[Your Full Name]\n\nThis is a general template. You can personalize it further by tailoring it to the specific job and company you're applying to!\n",
    //               confidence: 0.75,
    //             },
    //           ],
    //           autoFill: true,
    //         },
    //         {
    //           fieldOpid: "__3",
    //           memoryId: null,
    //           value: null,
    //           confidence: 0.2,
    //           reasoning:
    //             "There is no memory that specifically matches a LinkedIn profile URL. The purpose is unknown, and no relevant memories exist for URLs in this context.",
    //           alternativeMatches: [],
    //           autoFill: false,
    //         },
    //         {
    //           fieldOpid: "__4",
    //           memoryId: "019a26c7-35a2-77c9-9a2c-75bf724aa3ee",
    //           value: "Python, Javascript, Typescript, Ruby",
    //           confidence: 0.6,
    //           reasoning:
    //             "The field is about a primary programming language, which relates to Memory 4 that lists favorite programming languages. However, it is not a perfect match as it does not specify 'primary'.",
    //           alternativeMatches: [
    //             {
    //               memoryId: "019a1f75-9829-7307-a186-0311aef8a51c",
    //               value: "Earth - 100011",
    //               confidence: 0.5,
    //             },
    //           ],
    //           autoFill: false,
    //         },
    //         {
    //           fieldOpid: "__5",
    //           memoryId: "019a29b0-c7fa-727e-92d2-dad1c0cf1695",
    //           value:
    //             "# John Doe\n\n**Frontend Developer**\nAmsterdam, Netherlands | johndoe@example.com | +31 6 12345678 | (https://linkedin.com/in/johndoe)\\[LinkedIn]\n\n***\n\n## Experience\n\n**Frontend Developer at Cloudify Solutions**\n*Amsterdam, Netherlands | June 2022 – Present | 1 year 6 months*\n\n* Developed and maintained web-based applications using React, JavaScript, and TypeScript.\n* Migrated a complex AngularJS application to React for enhanced maintainability and user experience.\n* Created reusable UI components, improving consistency across the product and reducing development time for new features.\n* Collaborated closely with the UX/UI team to deliver engaging and responsive interfaces.\n\n**Junior Frontend Developer at TechSphere**\n*Berlin, Germany | June 2021 – May 2022 | 1 year*\n\n* Contributed to the development of a new customer portal, implementing a fresh design using Bootstrap and React.\n* Assisted with the integration of RESTful API services for better data visualization in dashboards.\n* Worked in a Scrum environment, closely with designers and backend developers to meet client requirements.\n\n***\n\n## Projects\n\n**TaskBuddy**\n*A task management web app built to help users organize their daily activities efficiently.*\n\n* Developed using Vue.js and Tailwind CSS for a responsive and clean user experience.\n* Implemented offline capabilities using IndexedDB for a smoother experience without an internet connection.\n* Enhanced the user experience with intuitive UI and task categorization features.\n\n**DevBoard**\n*An open-source project management dashboard application for small teams to track tasks and goals.*\n\n* Built with React, TypeScript, and MaterialUI, providing a seamless experience.\n* Integrated Redux for state management and Axios to handle API requests.\n* Utilized Jest for unit tests to ensure code quality and reliability.\n\n***\n\n## Skills\n\n* **Programming Languages**: JavaScript, TypeScript, HTML, CSS\n* **Frameworks**: React, Vue.js, Tailwind CSS, Bootstrap, MaterialUI\n* **Tools**: Git, VS Code, Jira, Webpack\n\n***\n\n## Education\n\n**Bachelor of Science in Computer Science**\n*Berlin University of Technology | 2017 – 2021*\n\n***\n\n## Languages\n\n* **English**: Fluent\n* **German**: Intermediate\n* **Dutch**: Basic\n\n***\n\n## Certificates\n\n* **Frontend Developer Certification** - FreeCodeCamp\n* **JavaScript Specialist** - W3Schools\n\n***\n\n## Interests\n\n* **Hobbies**: Exploring new JavaScript frameworks, playing guitar, running, and photography.",
    //           confidence: 0.75,
    //           reasoning:
    //             "The field is for a resume, and Memory 5 directly references a resume, making it a strong match.",
    //           alternativeMatches: [
    //             {
    //               memoryId: "019a2eb7-fb67-706c-9ef0-6ec48825749a",
    //               value:
    //                 "Sample Cover Letter\n[Your Name]\n[Your Address]\n[City, State, ZIP Code]\n[Your Email Address]\n[Your Phone Number]\n[Date]\n[Hiring Manager's Name]\n[Company Name]\n[Company Address]\n[City, State, ZIP Code]\nSubject: Application for [Job Title]\nDear [Hiring Manager's Name],\nI am excited to apply for the [Job Title] position at [Company Name], as advertised on [where you found the job posting]. With my [specific skills or experience], I am confident in my ability to contribute to your team and help achieve [specific company goals or values].\nIn my previous role as [Your Previous Job Title] at [Your Previous Company], I successfully [mention a key achievement or responsibility that aligns with the job you're applying for]. This experience allowed me to develop [specific skills or qualities], which I believe will be valuable in this role.\nWhat excites me most about [Company Name] is [mention something specific about the company, such as its mission, culture, or recent achievements]. I am particularly drawn to [specific aspect of the job or company] because it aligns with my passion for [related field or value].\nI would welcome the opportunity to bring my [specific skills or qualities] to [Company Name] and contribute to your ongoing success. I have attached my resume for your review and would be delighted to discuss how my background, skills, and enthusiasm align with your needs.\nThank you for considering my application. I look forward to the possibility of contributing to your team and would be happy to provide further information or schedule an interview at your convenience.\nWarm regards,\n[Your Full Name]\n\nThis is a general template. You can personalize it further by tailoring it to the specific job and company you're applying to!\n",
    //               confidence: 0.65,
    //             },
    //           ],
    //           autoFill: true,
    //         },
    //         {
    //           fieldOpid: "__6",
    //           memoryId: "019a2eb7-fb67-706c-9ef0-6ec48825749a",
    //           value:
    //             "Sample Cover Letter\n[Your Name]\n[Your Address]\n[City, State, ZIP Code]\n[Your Email Address]\n[Your Phone Number]\n[Date]\n[Hiring Manager's Name]\n[Company Name]\n[Company Address]\n[City, State, ZIP Code]\nSubject: Application for [Job Title]\nDear [Hiring Manager's Name],\nI am excited to apply for the [Job Title] position at [Company Name], as advertised on [where you found the job posting]. With my [specific skills or experience], I am confident in my ability to contribute to your team and help achieve [specific company goals or values].\nIn my previous role as [Your Previous Job Title] at [Your Previous Company], I successfully [mention a key achievement or responsibility that aligns with the job you're applying for]. This experience allowed me to develop [specific skills or qualities], which I believe will be valuable in this role.\nWhat excites me most about [Company Name] is [mention something specific about the company, such as its mission, culture, or recent achievements]. I am particularly drawn to [specific aspect of the job or company] because it aligns with my passion for [related field or value].\nI would welcome the opportunity to bring my [specific skills or qualities] to [Company Name] and contribute to your ongoing success. I have attached my resume for your review and would be delighted to discuss how my background, skills, and enthusiasm align with your needs.\nThank you for considering my application. I look forward to the possibility of contributing to your team and would be happy to provide further information or schedule an interview at your convenience.\nWarm regards,\n[Your Full Name]\n\nThis is a general template. You can personalize it further by tailoring it to the specific job and company you're applying to!\n",
    //           confidence: 0.7,
    //           reasoning:
    //             "The field is for a cover letter, which aligns with Memory 6 that contains a cover letter template. This is a relevant match.",
    //           alternativeMatches: [
    //             {
    //               memoryId: "019a29b0-c7fa-727e-92d2-dad1c0cf1695",
    //               value:
    //                 "# John Doe\n\n**Frontend Developer**\nAmsterdam, Netherlands | johndoe@example.com | +31 6 12345678 | (https://linkedin.com/in/johndoe)\\[LinkedIn]\n\n***\n\n## Experience\n\n**Frontend Developer at Cloudify Solutions**\n*Amsterdam, Netherlands | June 2022 – Present | 1 year 6 months*\n\n* Developed and maintained web-based applications using React, JavaScript, and TypeScript.\n* Migrated a complex AngularJS application to React for enhanced maintainability and user experience.\n* Created reusable UI components, improving consistency across the product and reducing development time for new features.\n* Collaborated closely with the UX/UI team to deliver engaging and responsive interfaces.\n\n**Junior Frontend Developer at TechSphere**\n*Berlin, Germany | June 2021 – May 2022 | 1 year*\n\n* Contributed to the development of a new customer portal, implementing a fresh design using Bootstrap and React.\n* Assisted with the integration of RESTful API services for better data visualization in dashboards.\n* Worked in a Scrum environment, closely with designers and backend developers to meet client requirements.\n\n***\n\n## Projects\n\n**TaskBuddy**\n*A task management web app built to help users organize their daily activities efficiently.*\n\n* Developed using Vue.js and Tailwind CSS for a responsive and clean user experience.\n* Implemented offline capabilities using IndexedDB for a smoother experience without an internet connection.\n* Enhanced the user experience with intuitive UI and task categorization features.\n\n**DevBoard**\n*An open-source project management dashboard application for small teams to track tasks and goals.*\n\n* Built with React, TypeScript, and MaterialUI, providing a seamless experience.\n* Integrated Redux for state management and Axios to handle API requests.\n* Utilized Jest for unit tests to ensure code quality and reliability.\n\n***\n\n## Skills\n\n* **Programming Languages**: JavaScript, TypeScript, HTML, CSS\n* **Frameworks**: React, Vue.js, Tailwind CSS, Bootstrap, MaterialUI\n* **Tools**: Git, VS Code, Jira, Webpack\n\n***\n\n## Education\n\n**Bachelor of Science in Computer Science**\n*Berlin University of Technology | 2017 – 2021*\n\n***\n\n## Languages\n\n* **English**: Fluent\n* **German**: Intermediate\n* **Dutch**: Basic\n\n***\n\n## Certificates\n\n* **Frontend Developer Certification** - FreeCodeCamp\n* **JavaScript Specialist** - W3Schools\n\n***\n\n## Interests\n\n* **Hobbies**: Exploring new JavaScript frameworks, playing guitar, running, and photography.",
    //               confidence: 0.6,
    //             },
    //           ],
    //           autoFill: false,
    //         },
    //         {
    //           fieldOpid: "__7",
    //           memoryId: "019a3395-46a0-7078-885e-d1c7241bdd4b",
    //           value: "Dune is my favourite book",
    //           confidence: 0.5,
    //           reasoning:
    //             "The field asks about a book that inspired the user, which loosely relates to Memory 7 about favorite books. It's not a perfect match but is the closest available.",
    //           alternativeMatches: [],
    //           autoFill: false,
    //         },
    //         {
    //           fieldOpid: "__8",
    //           memoryId: "019a3b45-2274-7019-97f7-d95870d24a87",
    //           value: "https://github.com/mikr13",
    //           confidence: 0.8,
    //           reasoning:
    //             "The field is for a GitHub profile, which directly matches Memory 8 that provides a GitHub link, making it a strong match.",
    //           alternativeMatches: [],
    //           autoFill: true,
    //         },
    //       ],
    //       forms: [
    //         {
    //           opid: "__form__0",
    //           action: "http://localhost:64195/form4-mixed-label-types",
    //           method: "get",
    //           name: "freelancerForm",
    //           fields: [
    //             {
    //               opid: "__0",
    //               formOpid: "__form__0",
    //               metadata: {
    //                 id: "applicant-name",
    //                 name: "full_name",
    //                 className: null,
    //                 type: "text",
    //                 placeholder: " ",
    //                 autocomplete: null,
    //                 required: true,
    //                 disabled: false,
    //                 readonly: false,
    //                 maxLength: null,
    //                 labelTag: "Full Name",
    //                 labelData: null,
    //                 labelAria: null,
    //                 labelLeft: null,
    //                 labelTop: "Floating Labels",
    //                 helperText: null,
    //                 fieldType: "text",
    //                 currentValue: "",
    //                 fieldPurpose: "name",
    //                 rect: {
    //                   x: 335.5,
    //                   y: 220.9140625,
    //                   width: 680,
    //                   height: 40.5,
    //                   top: 220.9140625,
    //                   right: 1015.5,
    //                   bottom: 261.4140625,
    //                   left: 335.5,
    //                 },
    //               },
    //             },
    //             {
    //               opid: "__1",
    //               formOpid: "__form__0",
    //               metadata: {
    //                 id: "applicant-email",
    //                 name: "email_addr",
    //                 className: null,
    //                 type: "email",
    //                 placeholder: " ",
    //                 autocomplete: null,
    //                 required: true,
    //                 disabled: false,
    //                 readonly: false,
    //                 maxLength: null,
    //                 labelTag: "Email Address",
    //                 labelData: null,
    //                 labelAria: null,
    //                 labelLeft: null,
    //                 labelTop: "Full Name",
    //                 helperText: null,
    //                 fieldType: "email",
    //                 currentValue: "",
    //                 fieldPurpose: "email",
    //                 rect: {
    //                   x: 335.5,
    //                   y: 286.4140625,
    //                   width: 680,
    //                   height: 40.5,
    //                   top: 286.4140625,
    //                   right: 1015.5,
    //                   bottom: 326.9140625,
    //                   left: 335.5,
    //                 },
    //               },
    //             },
    //             {
    //               opid: "__2",
    //               formOpid: "__form__0",
    //               metadata: {
    //                 id: "home-address",
    //                 name: "address",
    //                 className: null,
    //                 type: "text",
    //                 placeholder: null,
    //                 autocomplete: null,
    //                 required: false,
    //                 disabled: false,
    //                 readonly: false,
    //                 maxLength: null,
    //                 labelTag: "Home Address",
    //                 labelData: null,
    //                 labelAria: null,
    //                 labelLeft: null,
    //                 labelTop: "Home Address",
    //                 helperText: null,
    //                 fieldType: "text",
    //                 currentValue: "",
    //                 fieldPurpose: "address",
    //                 rect: {
    //                   x: 335.5,
    //                   y: 418.4140625,
    //                   width: 680,
    //                   height: 38,
    //                   top: 418.4140625,
    //                   right: 1015.5,
    //                   bottom: 456.4140625,
    //                   left: 335.5,
    //                 },
    //               },
    //             },
    //             {
    //               opid: "__3",
    //               formOpid: "__form__0",
    //               metadata: {
    //                 id: "linkedin-profile",
    //                 name: "linkedin_url",
    //                 className: null,
    //                 type: "url",
    //                 placeholder: null,
    //                 autocomplete: null,
    //                 required: false,
    //                 disabled: false,
    //                 readonly: false,
    //                 maxLength: null,
    //                 labelTag: "LinkedIn Profile",
    //                 labelData: null,
    //                 labelAria: null,
    //                 labelLeft: null,
    //                 labelTop: "LinkedIn Profile",
    //                 helperText: null,
    //                 fieldType: "url",
    //                 currentValue: "",
    //                 fieldPurpose: "unknown",
    //                 rect: {
    //                   x: 335.5,
    //                   y: 500.9140625,
    //                   width: 680,
    //                   height: 38,
    //                   top: 500.9140625,
    //                   right: 1015.5,
    //                   bottom: 538.9140625,
    //                   left: 335.5,
    //                 },
    //               },
    //             },
    //             {
    //               opid: "__4",
    //               formOpid: "__form__0",
    //               metadata: {
    //                 id: "primary-language",
    //                 name: "programming_language",
    //                 className: null,
    //                 type: "text",
    //                 placeholder: null,
    //                 autocomplete: null,
    //                 required: false,
    //                 disabled: false,
    //                 readonly: false,
    //                 maxLength: null,
    //                 labelTag: "Primary Programming Language:",
    //                 labelData: null,
    //                 labelAria: null,
    //                 labelLeft: "Primary Programming Language:",
    //                 labelTop: "Primary Programming Language:",
    //                 helperText: null,
    //                 fieldType: "text",
    //                 currentValue: "",
    //                 fieldPurpose: "unknown",
    //                 rect: {
    //                   x: 578.8671875,
    //                   y: 605.9140625,
    //                   width: 436.6328125,
    //                   height: 38,
    //                   top: 605.9140625,
    //                   right: 1015.5,
    //                   bottom: 643.9140625,
    //                   left: 578.8671875,
    //                 },
    //               },
    //             },
    //             {
    //               opid: "__5",
    //               formOpid: "__form__0",
    //               metadata: {
    //                 id: "github-handle",
    //                 name: "github_url",
    //                 className: null,
    //                 type: "url",
    //                 placeholder: null,
    //                 autocomplete: null,
    //                 required: false,
    //                 disabled: false,
    //                 readonly: false,
    //                 maxLength: null,
    //                 labelTag: "GitHub Profile:",
    //                 labelData: null,
    //                 labelAria: null,
    //                 labelLeft: "GitHub Profile:",
    //                 labelTop: "GitHub Profile:",
    //                 helperText: null,
    //                 fieldType: "url",
    //                 currentValue: "",
    //                 fieldPurpose: "unknown",
    //                 rect: {
    //                   x: 535.5,
    //                   y: 663.9140625,
    //                   width: 480,
    //                   height: 38,
    //                   top: 663.9140625,
    //                   right: 1015.5,
    //                   bottom: 701.9140625,
    //                   left: 535.5,
    //                 },
    //               },
    //             },
    //             {
    //               opid: "__6",
    //               formOpid: "__form__0",
    //               metadata: {
    //                 id: null,
    //                 name: "resume_text",
    //                 className: null,
    //                 type: "text",
    //                 placeholder: "Paste your resume or link here...",
    //                 autocomplete: null,
    //                 required: false,
    //                 disabled: false,
    //                 readonly: false,
    //                 maxLength: null,
    //                 labelTag: null,
    //                 labelData: null,
    //                 labelAria: "Resume",
    //                 labelLeft: null,
    //                 labelTop: "No Visible Label (Aria-label only)",
    //                 helperText: "Paste your resume text or provide a link",
    //                 fieldType: "text",
    //                 currentValue: "",
    //                 fieldPurpose: "unknown",
    //                 rect: {
    //                   x: 335.5,
    //                   y: 768.9140625,
    //                   width: 680,
    //                   height: 42,
    //                   top: 768.9140625,
    //                   right: 1015.5,
    //                   bottom: 810.9140625,
    //                   left: 335.5,
    //                 },
    //               },
    //             },
    //             {
    //               opid: "__7",
    //               formOpid: "__form__0",
    //               metadata: {
    //                 id: "cover-letter-text",
    //                 name: "cover_letter",
    //                 className: null,
    //                 type: "textarea",
    //                 placeholder: null,
    //                 autocomplete: null,
    //                 required: false,
    //                 disabled: false,
    //                 readonly: false,
    //                 maxLength: null,
    //                 labelTag: "Why do you want to work with us?",
    //                 labelData: null,
    //                 labelAria: null,
    //                 labelLeft: null,
    //                 labelTop: "Why do you want to work with us?",
    //                 helperText: null,
    //                 fieldType: "textarea",
    //                 currentValue: "",
    //                 fieldPurpose: "unknown",
    //                 rect: {
    //                   x: 335.5,
    //                   y: 920.9140625,
    //                   width: 680,
    //                   height: 90,
    //                   top: 920.9140625,
    //                   right: 1015.5,
    //                   bottom: 1010.9140625,
    //                   left: 335.5,
    //                 },
    //               },
    //             },
    //             {
    //               opid: "__8",
    //               formOpid: "__form__0",
    //               metadata: {
    //                 id: "book-recommendation",
    //                 name: "favorite_book",
    //                 className: null,
    //                 type: "textarea",
    //                 placeholder:
    //                   "Share a book that changed your perspective...",
    //                 autocomplete: null,
    //                 required: false,
    //                 disabled: false,
    //                 readonly: false,
    //                 maxLength: null,
    //                 labelTag: "What book inspired you recently?",
    //                 labelData: null,
    //                 labelAria: null,
    //                 labelLeft: null,
    //                 labelTop: "What book inspired you recently?",
    //                 helperText: null,
    //                 fieldType: "textarea",
    //                 currentValue: "",
    //                 fieldPurpose: "unknown",
    //                 rect: {
    //                   x: 335.5,
    //                   y: 1059.4140625,
    //                   width: 680,
    //                   height: 90,
    //                   top: 1059.4140625,
    //                   right: 1015.5,
    //                   bottom: 1149.4140625,
    //                   left: 335.5,
    //                 },
    //               },
    //             },
    //           ],
    //         },
    //       ],
    //     },
    //   });
    // }, 3000);
    // End temporary UI show
  },
});
