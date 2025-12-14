import "./content.css";

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
  FieldOpId,
  FormFieldElement,
  FormOpId,
  PreviewSidebarPayload,
} from "@/types/autofill";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { AutopilotManager } from "./components/autopilot-manager";
import { FillTriggerManager } from "./components/fill-trigger-manager";
import { PreviewSidebarManager } from "./components/preview-manager";
import { FieldAnalyzer } from "./lib/field-analyzer";
import { FormDetector } from "./lib/form-detector";

const logger = createLogger("content");

const formCache = new Map<FormOpId, DetectedForm>();
const fieldCache = new Map<FieldOpId, DetectedField>();
let serializedFormCache: DetectedFormSnapshot[] = [];
let previewManager: PreviewSidebarManager | null = null;
let autopilotManager: AutopilotManager | null = null;
let fillTriggerManager: FillTriggerManager | null = null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fill a React Select or similar combobox dropdown
 * These are custom select components that use an input with role="combobox"
 */
const fillReactSelect = async (
  element: HTMLInputElement,
  value: string,
): Promise<boolean> => {
  try {
    logger.debug(`React Select: attempting to fill with value "${value}"`);

    // Step 1: Find the hidden input that holds the actual value
    const selectContainer = element.closest(
      '.select, .select__container, [class*="select"]',
    );
    if (selectContainer) {
      const hiddenInput = selectContainer.querySelector<HTMLInputElement>(
        'input[type="hidden"], input[aria-hidden="true"], input[tabindex="-1"]:not([role])',
      );
      if (hiddenInput && hiddenInput !== element) {
        logger.debug(
          `React Select: found hidden input, setting value directly`,
        );

        // Set value using native setter to bypass React
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(hiddenInput, value);
        } else {
          hiddenInput.value = value;
        }

        hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // Step 2: Focus the input
    element.focus();

    // Step 3: Open dropdown with mouse down (React Select uses onMouseDown)
    element.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    await delay(50);

    // Also try clicking the control container (React Select listens on the wrapper)
    const controlContainer = element.closest('[class*="control"]');
    if (controlContainer) {
      controlContainer.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    }

    await delay(200);

    // Step 4: Look for the menu that should now be open
    // React Select creates a portal or sibling menu element
    let menuEl: Element | null = null;

    // Try aria-controls first
    const listboxId = element.getAttribute("aria-controls");
    if (listboxId) {
      menuEl = document.getElementById(listboxId);
    }

    // Fallback: look for menu in document (React Select often uses portals)
    if (!menuEl) {
      menuEl = document.querySelector(
        '[class*="menu"]:not([class*="menu-"]), [class*="-menu"], .select__menu',
      );
    }

    logger.debug(`React Select: menu found: ${!!menuEl}`);

    // Step 5: Find all options and look for a match
    let options: NodeListOf<HTMLElement> | HTMLElement[] = [];

    if (menuEl) {
      options = menuEl.querySelectorAll<HTMLElement>(
        '[class*="option"], [role="option"]',
      );
    } else {
      // Search the entire document for React Select options
      options = document.querySelectorAll<HTMLElement>(
        '[class*="select__option"], [id*="react-select"][id*="option"]',
      );
    }

    logger.debug(`React Select: found ${options.length} options`);

    const normalizedValue = value.toLowerCase().trim();
    let matchedOption: HTMLElement | null = null;

    for (const option of options) {
      const optionText = option.textContent?.toLowerCase().trim() || "";
      logger.debug(`React Select: checking option "${optionText}"`);

      if (optionText === normalizedValue) {
        matchedOption = option;
        break;
      }
      // Partial match as fallback
      if (!matchedOption && optionText.includes(normalizedValue)) {
        matchedOption = option;
      }
    }

    if (matchedOption) {
      logger.debug(
        `React Select: clicking matched option "${matchedOption.textContent}"`,
      );
      matchedOption.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      await delay(50);
      matchedOption.click();
      return true;
    }

    // Step 6: If no menu/options found, try typing to filter
    logger.debug("React Select: no direct match, trying to type and filter");

    // Clear any existing value first
    element.value = "";
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "",
        inputType: "deleteContentBackward",
      }),
    );

    // Type each character to trigger React's onChange
    for (const char of value) {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, bubbles: true }),
      );
      element.value += char;
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: char,
          inputType: "insertText",
        }),
      );
      await delay(30);
    }

    await delay(200);

    // Try to find options again after typing
    const filteredOptions = document.querySelectorAll<HTMLElement>(
      '[class*="select__option"], [id*="react-select"][id*="option"], [role="option"]',
    );

    logger.debug(
      `React Select: found ${filteredOptions.length} filtered options`,
    );

    if (filteredOptions.length > 0) {
      // Click the first option
      const firstOption = filteredOptions[0];
      logger.debug(
        `React Select: clicking first filtered option "${firstOption.textContent}"`,
      );
      firstOption.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      await delay(50);
      firstOption.click();
      return true;
    }

    // Last resort: press Enter
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
      }),
    );

    logger.debug(`React Select: pressed Enter as fallback`);
    return true;
  } catch (error) {
    logger.error("Error filling React Select:", error);
    return false;
  }
};

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

const serializeForms = (
  forms: DetectedForm[],
  frameId?: number,
): DetectedFormSnapshot[] =>
  forms.map((form) => ({
    opid: form.opid,
    action: form.action,
    method: form.method,
    name: form.name,
    fields: form.fields.map((field) => {
      const { rect, options, ...restMetadata } = field.metadata;

      return {
        opid: field.opid,
        formOpid: field.formOpid,
        frameId,
        metadata: {
          ...restMetadata,
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
          // Serialize options without element references
          options: options?.map(({ value, label }) => ({ value, label })),
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

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  cssInjectionMode: "ui",
  runAt: "document_idle",

  async main(ctx) {
    const isMainFrame = window.self === window.top;
    const frameUrl = window.location.href;
    const parentUrl = isMainFrame ? frameUrl : document.referrer || frameUrl;

    const getFrameDepth = (): number => {
      let depth = 0;
      let win: Window = window;
      try {
        while (win !== win.parent && depth < 10) {
          depth++;
          win = win.parent;
        }
      } catch {
        // Access denied to parent frame (cross-origin)
      }
      return depth;
    };

    const frameDepth = getFrameDepth();

    logger.info("Content script loaded:", {
      url: frameUrl,
      isMainFrame,
      frameDepth,
      parentUrl,
    });

    const fieldAnalyzer = new FieldAnalyzer();
    const formDetector = new FormDetector(fieldAnalyzer);
    const contextExtractor = new WebsiteContextExtractor();
    fillTriggerManager = new FillTriggerManager();
    fillTriggerManager.initialize();

    contentAutofillMessaging.onMessage(
      "collectAllFrameForms",
      async ({ data }: { data: { requestId: string } }) => {
        const frameInfo = {
          isMainFrame,
          frameUrl,
          parentUrl,
          frameDepth,
        };

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
                  } else {
                    stats.reasons.noQuality++;
                  }
                  return false;
                }

                const primaryLabel = getPrimaryLabel(field.metadata);

                if (primaryLabel) {
                  const normalizedLabel = primaryLabel.toLowerCase().trim();
                  if (seenLabels.has(normalizedLabel)) {
                    stats.filtered++;
                    stats.reasons.duplicate++;
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

          cacheDetectedForms(forms);
          const serializedForms = serializeForms(forms, undefined);

          if (isMainFrame) {
            serializedFormCache = serializedForms;
          }

          const totalFields = forms.reduce(
            (sum, form) => sum + form.fields.length,
            0,
          );

          const websiteContext = contextExtractor.extract();

          logger.info(
            `Frame ${isMainFrame ? "main" : "iframe"} (depth: ${frameDepth}) detected ${forms.length} forms with ${totalFields} fields`,
          );

          await browser.runtime.sendMessage({
            type: "FRAME_FORMS_DETECTED",
            requestId: data.requestId,
            result: {
              success: true,
              forms: serializedForms,
              totalFields,
              websiteContext,
              frameInfo,
            },
          });
        } catch (error) {
          logger.error("Error detecting forms in frame:", error);
          await browser.runtime.sendMessage({
            type: "FRAME_FORMS_DETECTED",
            requestId: data.requestId,
            result: {
              success: false,
              forms: [],
              totalFields: 0,
              error: error instanceof Error ? error.message : "Unknown error",
              frameInfo,
            },
          });
        }
      },
    );

    contentAutofillMessaging.onMessage(
      "detectForms",
      async (): Promise<DetectFormsResult> => {
        const frameInfo = {
          isMainFrame,
          frameUrl,
          parentUrl,
          frameDepth,
        };

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
          serializedFormCache = serializeForms(forms, undefined);

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
            `Detected ${forms.length} forms with ${totalFields} total fields in ${isMainFrame ? "main frame" : "iframe"}`,
          );

          return {
            success: true,
            forms: serializedFormCache,
            totalFields,
            websiteContext,
            frameInfo,
          };
        } catch (error) {
          logger.error("Error detecting forms:", error);
          return {
            success: false,
            forms: [],
            totalFields: 0,
            error: error instanceof Error ? error.message : "Unknown error",
            frameInfo,
          };
        }
      },
    );

    contentAutofillMessaging.onMessage(
      "updateProgress",
      async ({ data: progress }: { data: AutofillProgress }) => {
        if (!isMainFrame) {
          logger.debug("Skipping progress UI in iframe");
          return true;
        }

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
        if (!isMainFrame) {
          logger.debug("Skipping preview UI in iframe");
          return true;
        }

        logger.info("Received preview payload from background", {
          mappings: data.mappings.length,
          forms: data.forms.length,
        });

        logger.info("Full payload structure:", {
          payload: data,
        });

        const settingStore = await storage.aiSettings.getValue();
        let manager: PreviewSidebarManager | AutopilotManager;

        if (settingStore.autopilotMode) {
          manager = ensureAutopilotManager(ctx);
        } else {
          manager = ensurePreviewManager(ctx);
        }

        try {
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

    contentAutofillMessaging.onMessage("fillFields", async ({ data }) => {
      const { fieldsToFill } = data;

      logger.info(
        `Filling ${fieldsToFill.length} fields in ${isMainFrame ? "main frame" : "iframe"}`,
      );

      for (const { fieldOpid, value } of fieldsToFill) {
        let field = fieldCache.get(fieldOpid as FieldOpId);

        if (!field) {
          const element = document.querySelector(
            `[data-superfill-opid="${fieldOpid}"]`,
          ) as FormFieldElement;
          if (element) {
            logger.debug(
              `Field ${fieldOpid} not in cache, found via data-superfill-opid attribute`,
            );
            field = { element } as DetectedField;
          }
        }

        if (field) {
          const element = field.element;

          if (element instanceof HTMLInputElement) {
            element.focus({ preventScroll: true });

            if (element.type === "radio") {
              // For radio groups, find and check the radio with matching value
              const radioName = element.name;
              if (radioName) {
                // Find all radios with the same opid (part of the same group)
                const radios = document.querySelectorAll<HTMLInputElement>(
                  `input[type="radio"][data-superfill-opid="${fieldOpid}"]`,
                );

                let matched = false;
                const normalizedValue = value.toLowerCase().trim();

                for (const radio of radios) {
                  const radioValue = radio.value.toLowerCase().trim();
                  // Also check the label for a match
                  const radioLabel =
                    radio.labels?.[0]?.textContent?.toLowerCase().trim() || "";

                  if (
                    radioValue === normalizedValue ||
                    radioLabel === normalizedValue
                  ) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event("input", { bubbles: true }));
                    radio.dispatchEvent(new Event("change", { bubbles: true }));
                    matched = true;
                    logger.debug(
                      `Radio group ${radioName}: selected value "${radio.value}"`,
                    );
                    break;
                  }
                }

                if (!matched) {
                  logger.warn(
                    `Radio group ${radioName}: no option matched value "${value}"`,
                  );
                }
              }
            } else if (element.type === "checkbox") {
              element.checked =
                value === "true" || value === "on" || value === "1";
              element.dispatchEvent(new Event("input", { bubbles: true }));
              element.dispatchEvent(new Event("change", { bubbles: true }));
            } else if (element.getAttribute("role") === "combobox") {
              // Handle React Select / custom combobox dropdowns
              await fillReactSelect(element, value);
            } else {
              element.value = value;
              element.dispatchEvent(new Event("input", { bubbles: true }));
              element.dispatchEvent(new Event("change", { bubbles: true }));
            }
          } else if (element instanceof HTMLTextAreaElement) {
            element.focus({ preventScroll: true });
            element.value = value;
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
          } else if (element instanceof HTMLSelectElement) {
            const normalizedValue = value.toLowerCase();
            let matched = false;

            for (const option of Array.from(element.options)) {
              if (
                option.value.toLowerCase() === normalizedValue ||
                option.text.toLowerCase() === normalizedValue
              ) {
                option.selected = true;
                matched = true;
                break;
              }
            }

            if (!matched) {
              element.value = value;
            }

            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
          }

          logger.debug(`Filled field ${fieldOpid} with value`);
        } else {
          logger.warn(`Field ${fieldOpid} not found in cache`);
        }
      }
    });

    contentAutofillMessaging.onMessage("closePreview", async () => {
      if (!isMainFrame) {
        return true;
      }

      if (previewManager) {
        previewManager.destroy();
      }

      if (autopilotManager) {
        autopilotManager.hide();
      }

      if (fillTriggerManager) {
        fillTriggerManager.destroy();
      }

      return true;
    });
  },
});
