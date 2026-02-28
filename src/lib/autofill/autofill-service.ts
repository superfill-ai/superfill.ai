import { defineProxyService } from "@webext-core/proxy-service";
import { AIMatcher } from "@/lib/ai/matcher";
import { getAuthService } from "@/lib/auth/auth-service";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { getSessionService } from "@/lib/autofill/session-service";
import {
  attachToTab,
  captureScreenshot,
  fillAllFields as cdpFillAllFields,
  detachFromTab,
  detectFormFields,
  isCDPSupported,
} from "@/lib/cdp";
import { createLogger } from "@/lib/logger";
import { getKeyVaultService } from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import type {
  AutofillResult,
  CDPDetectedField,
  CDPFieldMapping,
  CompressedFieldData,
  CompressedMemoryData,
  DetectedFieldSnapshot,
  DetectedFormSnapshot,
  DetectFormsResult,
  FieldMapping,
  FieldOpId,
  FormOpId,
  PreviewSidebarPayload,
} from "@/types/autofill";
import type { WebsiteContext } from "@/types/context";
import type { MemoryEntry } from "@/types/memory";
import type { AISettings } from "@/types/settings";
import { ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED } from "../errors";
import { aiSettings } from "../storage/ai-settings";
import { MAX_FIELDS_PER_PAGE, MAX_MEMORIES_FOR_MATCHING } from "./constants";
import { FallbackMatcher } from "./fallback-matcher";
import { isCrypticString } from "./field-quality";
import { createEmptyMapping } from "./mapping-utils";

const logger = createLogger("autofill-service");

class AutofillService {
  private aiMatcher: AIMatcher;
  private fallbackMatcher: FallbackMatcher;
  private currentAiSettings: AISettings | null = null;
  private unwatchAiSettings?: () => void;

  constructor() {
    this.aiMatcher = new AIMatcher();
    this.fallbackMatcher = new FallbackMatcher();

    this.unwatchAiSettings = aiSettings.watch((newSettings) => {
      this.currentAiSettings = newSettings;
      logger.info("AI settings updated:", newSettings);
    });

    aiSettings.getValue().then((settings) => {
      this.currentAiSettings = settings;
      logger.info("AI settings initialized:", settings);
    });
  }

  dispose() {
    this.unwatchAiSettings?.();
    this.unwatchAiSettings = undefined;
    logger.info("AutofillService disposed");
  }

  async startAutofillOnActiveTab(): Promise<{
    success: boolean;
    fieldsDetected: number;
    mappingsFound: number;
    error?: string;
  }> {
    let sessionId: string | undefined;
    let tabId: number | undefined;
    const sessionService = getSessionService();

    logger.info("Starting autofill");

    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.id) {
        throw new Error("No active tab found");
      }

      tabId = tab.id;
      logger.info("Starting autofill on tab:", tabId, tab.url);

      try {
        await contentAutofillMessaging.sendMessage(
          "updateProgress",
          {
            state: "detecting",
            message: "Detecting forms...",
          },
          tabId,
        );
      } catch (error) {
        logger.error("Failed to communicate with content script:", error);
        throw new Error(
          "Could not connect to page. Please refresh the page and try again.",
        );
      }

      const session = await sessionService.startSession();
      sessionId = session.id;
      logger.info("Started autofill session:", sessionId);

      // Try CDP path (Chrome/Edge) — falls back to DOM path (Firefox, or if CDP fails)
      if (isCDPSupported()) {
        try {
          const cdpResult = await this.runCDPAutofill(tabId, sessionId);
          if (cdpResult) return cdpResult;
        } catch (cdpError) {
          logger.warn(
            "CDP autofill failed, falling back to DOM path:",
            cdpError,
          );
        }
      }

      const requestId = `autofill-${sessionId}-${Date.now()}`;
      const collectedResults: DetectFormsResult[] = [];

      const collectionPromise = new Promise<void>((resolve) => {
        const removeListener = contentAutofillMessaging.onMessage(
          "frameFormsDetected",
          ({ data }) => {
            if (data.requestId === requestId && data.result) {
              collectedResults.push(data.result);
              logger.info(`Received forms from frame:`, data.result.frameInfo);
            }
          },
        );

        setTimeout(() => {
          removeListener();
          resolve();
        }, 2000);
      });

      try {
        await contentAutofillMessaging.sendMessage(
          "collectAllFrameForms",
          { requestId },
          tabId,
        );
      } catch (error) {
        logger.error("Failed to send collectAllFrameForms:", error);
      }

      await collectionPromise;

      logger.info(`Collected results from ${collectedResults.length} frames`);

      const successfulResults = collectedResults.filter(
        (result) => result.success === true,
      );

      if (successfulResults.length === 0) {
        await contentAutofillMessaging.sendMessage(
          "closePreview",
          undefined,
          tabId,
        );
        throw new Error("No forms detected in any frame");
      }

      const allForms = successfulResults.flatMap((result) => result.forms);
      const totalFields = successfulResults.reduce(
        (sum, result) => sum + result.totalFields,
        0,
      );
      const mainFrameResult = successfulResults.find(
        (r) => r.frameInfo.isMainFrame,
      );
      const websiteContext =
        mainFrameResult?.websiteContext || successfulResults[0].websiteContext;

      logger.info(
        `Detected ${totalFields} fields in ${allForms.length} forms across ${successfulResults.length} frames`,
      );

      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        {
          state: "analyzing",
          message: "Analyzing fields...",
          fieldsDetected: totalFields,
        },
        tabId,
      );

      await sessionService.updateSessionStatus(sessionId, "matching");

      const allFields = allForms.flatMap((form) => form.fields);
      const pageUrl = tab.url || "";

      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        {
          state: "matching",
          message: "Matching memories...",
          fieldsDetected: totalFields,
        },
        tabId,
      );

      const processingResult = await this.processForms(
        allForms,
        pageUrl,
        websiteContext,
      );

      logger.info("Autofill processing result:", processingResult);

      const matchedCount = processingResult.mappings.filter(
        (mapping) => mapping.value !== null,
      ).length;

      await sessionService.updateSessionStatus(sessionId, "reviewing");

      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        {
          state: "showing-preview",
          message: "Preparing preview...",
          fieldsDetected: totalFields,
          fieldsMatched: matchedCount,
        },
        tabId,
      );

      try {
        await contentAutofillMessaging.sendMessage(
          "showPreview",
          this.buildPreviewPayload(allForms, processingResult, sessionId),
          tabId,
        );
      } catch (previewError) {
        logger.error("Failed to send preview payload:", previewError);
      }

      if (!processingResult.success) {
        throw new Error(processingResult.error || "Failed to process fields");
      }

      logger.info(
        `Processed ${allFields.length} fields and found ${matchedCount} matches`,
      );

      return {
        success: true,
        fieldsDetected: totalFields,
        mappingsFound: matchedCount,
      };
    } catch (error) {
      logger.error("Error starting autofill:", error);

      if (sessionId) {
        await sessionService.updateSessionStatus(sessionId, "failed");
      }

      if (tabId) {
        try {
          await contentAutofillMessaging.sendMessage(
            "closePreview",
            undefined,
            tabId,
          );

          await contentAutofillMessaging.sendMessage(
            "updateProgress",
            {
              state: "failed",
              message: "Autofill failed",
              error: error instanceof Error ? error.message : "Unknown error",
            },
            tabId,
          );
        } catch (progressError) {
          logger.error("Failed to send error progress:", progressError);
        }
      }

      return {
        success: false,
        fieldsDetected: 0,
        mappingsFound: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async runCDPAutofill(
    tabId: number,
    sessionId: string,
  ): Promise<{
    success: boolean;
    fieldsDetected: number;
    mappingsFound: number;
    error?: string;
  } | null> {
    const sessionService = getSessionService();

    try {
      await attachToTab(tabId);
    } catch (attachError) {
      logger.warn(
        "CDP attach failed (user denied or unsupported):",
        attachError,
      );
      return null;
    }

    try {
      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        { state: "detecting", message: "Detecting forms via CDP..." },
        tabId,
      );

      const cdpFields = await detectFormFields(tabId);

      if (cdpFields.length === 0) {
        logger.info("CDP detected no fields, falling back to DOM");
        return null;
      }

      logger.info(`CDP detected ${cdpFields.length} fields`);

      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        {
          state: "analyzing",
          message: "Analyzing fields...",
          fieldsDetected: cdpFields.length,
        },
        tabId,
      );

      const settings = this.currentAiSettings;
      if (!settings) throw new Error("AI settings not loaded");

      const useCloudMode = settings.cloudModelsEnabled;
      let screenshot: string | undefined;

      if (useCloudMode) {
        try {
          screenshot = await captureScreenshot(tabId);
        } catch (screenshotError) {
          logger.warn("Screenshot capture failed:", screenshotError);
        }
      }

      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        {
          state: "matching",
          message: "Matching memories...",
          fieldsDetected: cdpFields.length,
        },
        tabId,
      );

      const limitedFields = cdpFields.slice(0, MAX_FIELDS_PER_PAGE);
      const compressedFields = limitedFields.map((f) =>
        this.compressCDPField(f),
      );

      const allMemories = await storage.memories.getValue();
      if (allMemories.length === 0) {
        return {
          success: true,
          fieldsDetected: cdpFields.length,
          mappingsFound: 0,
        };
      }

      const memories = allMemories.slice(0, MAX_MEMORIES_FOR_MATCHING);
      const compressedMemories = memories.map((m) => this.compressMemory(m));

      // Get website context from content script
      let websiteContext: WebsiteContext = {
        metadata: {
          title: "",
          description: null,
          keywords: null,
          ogTitle: null,
          ogDescription: null,
          ogSiteName: null,
          ogType: null,
          url: "",
        },
        websiteType: "unknown",
        formPurpose: "unknown",
      };

      try {
        const detectResult = await contentAutofillMessaging.sendMessage(
          "detectForms",
          undefined,
          tabId,
        );
        if (detectResult?.success) {
          websiteContext = detectResult.websiteContext;
        }
      } catch {
        logger.warn("Could not get website context from content script");
      }

      const mappings = await this.matchCDPFields(
        compressedFields,
        compressedMemories,
        websiteContext,
        settings,
        screenshot,
      );

      const matchedCount = mappings.filter((m) => m.value !== null).length;

      await sessionService.updateSessionStatus(sessionId, "reviewing");

      // Build a synthetic preview payload to reuse existing preview UI
      const previewPayload = this.buildCDPPreviewPayload(
        limitedFields,
        mappings,
        sessionId,
      );

      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        {
          state: "showing-preview",
          message: "Preparing preview...",
          fieldsDetected: cdpFields.length,
          fieldsMatched: matchedCount,
        },
        tabId,
      );

      try {
        await contentAutofillMessaging.sendMessage(
          "showPreview",
          previewPayload,
          tabId,
        );
      } catch (previewError) {
        logger.error("Failed to send CDP preview payload:", previewError);
      }

      // Store CDP mappings for later fill via cdpFillConfirmed
      this.pendingCDPFill = { tabId, fields: limitedFields, mappings };

      return {
        success: true,
        fieldsDetected: cdpFields.length,
        mappingsFound: matchedCount,
      };
    } catch (error) {
      logger.error("CDP autofill error:", error);
      throw error;
    } finally {
      await detachFromTab(tabId);
    }
  }

  private pendingCDPFill: {
    tabId: number;
    fields: CDPDetectedField[];
    mappings: FieldMapping[];
  } | null = null;

  async executeCDPFill(
    fieldsToFill: Array<{ fieldOpid: string; value: string }>,
  ): Promise<void> {
    if (!this.pendingCDPFill) {
      logger.warn("No pending CDP fill data");
      return;
    }

    const { tabId, fields } = this.pendingCDPFill;
    this.pendingCDPFill = null;

    const fieldMap = new Map(fields.map((f) => [f.opid, f]));
    const cdpMappings: CDPFieldMapping[] = [];

    for (const item of fieldsToFill) {
      const field = fieldMap.get(item.fieldOpid);
      if (field) {
        cdpMappings.push({ field, value: item.value, confidence: 1 });
      }
    }

    if (cdpMappings.length === 0) return;

    try {
      await attachToTab(tabId);
      await cdpFillAllFields(tabId, cdpMappings);
    } finally {
      await detachFromTab(tabId);
    }
  }

  private compressCDPField(field: CDPDetectedField): CompressedFieldData {
    const roleToFieldType: Record<string, CompressedFieldData["type"]> = {
      textbox: "text",
      searchbox: "text",
      textarea: "textarea",
      combobox: "select",
      listbox: "select",
      checkbox: "checkbox",
      switch: "checkbox",
      menuitemcheckbox: "checkbox",
      radiogroup: "radio",
      spinbutton: "number",
      slider: "number",
    };

    const type = roleToFieldType[field.role] ?? "text";

    const labels = [field.name, field.description].filter(
      (s) => s && s.length > 0,
    );

    return {
      opid: field.opid,
      highlightIndex: field.highlightIndex,
      type,
      purpose: "unknown",
      labels,
      context: field.description || "",
      ...(field.options?.length
        ? {
            options: field.options.map((o) => ({
              value: o.value,
              label: o.label,
            })),
          }
        : {}),
    };
  }

  private async matchCDPFields(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
    websiteContext: WebsiteContext,
    settings: AISettings,
    screenshot?: string,
  ): Promise<FieldMapping[]> {
    const useCloudMode = settings.cloudModelsEnabled;

    try {
      if (useCloudMode) {
        const authService = getAuthService();
        const session = await authService.getSession();

        if (!session?.access_token) {
          logger.warn(
            "Cloud models enabled but user not authenticated, using BYOK/fallback",
          );
          const provider = settings.selectedProvider;
          if (!provider) {
            return await this.fallbackMatcher.matchFields(fields, memories);
          }
          const keyVaultService = getKeyVaultService();
          const apiKey = await keyVaultService.getKey(provider);
          if (!apiKey) {
            return await this.fallbackMatcher.matchFields(fields, memories);
          }
          return await this.aiMatcher.matchFields(
            fields,
            memories,
            websiteContext,
            false,
            provider,
            apiKey,
            settings.selectedModels?.[provider],
          );
        }

        return await this.aiMatcher.matchFields(
          fields,
          memories,
          websiteContext,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          screenshot,
        );
      }

      const provider = settings.selectedProvider;
      if (!provider) throw new Error(ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED);

      const keyVaultService = getKeyVaultService();
      const apiKey = await keyVaultService.getKey(provider);

      if (!apiKey) {
        return await this.fallbackMatcher.matchFields(fields, memories);
      }

      return await this.aiMatcher.matchFields(
        fields,
        memories,
        websiteContext,
        false,
        provider,
        apiKey,
        settings.selectedModels?.[provider],
      );
    } catch (error) {
      logger.error("CDP AI matching failed, using fallback:", error);
      return await this.fallbackMatcher.matchFields(fields, memories);
    }
  }

  private buildCDPPreviewPayload(
    fields: CDPDetectedField[],
    mappings: FieldMapping[],
    sessionId: string,
  ): PreviewSidebarPayload {
    const confidenceThreshold =
      this.currentAiSettings?.confidenceThreshold ?? 0.6;

    const mappingsWithThreshold = mappings.map((mapping) => ({
      ...mapping,
      autoFill:
        mapping.value !== null && mapping.confidence >= confidenceThreshold,
    }));

    // Build synthetic form snapshots for the preview UI
    const syntheticFields: DetectedFieldSnapshot[] = fields.map((f, index) => ({
      opid: `__${index}` as unknown as FieldOpId,
      formOpid: "__form__cdp" as unknown as FormOpId,
      highlightIndex: f.highlightIndex,
      frameId: undefined,
      metadata: {
        id: f.opid,
        name: f.name,
        className: null,
        type: f.role,
        labelTag: f.name,
        labelData: null,
        labelAria: f.name,
        labelLeft: null,
        labelTop: null,
        placeholder: null,
        helperText: f.description || null,
        autocomplete: null,
        required: f.required,
        disabled: f.disabled,
        readonly: false,
        maxLength: null,
        rect: f.rect,
        currentValue: f.value,
        fieldType: this.compressCDPField(f).type as CompressedFieldData["type"],
        fieldPurpose: "unknown" as const,
        isVisible: true,
        isTopElement: true,
        isInteractive: true,
        options: f.options?.map((o) => ({ value: o.value, label: o.label })),
      },
    }));

    const syntheticForm: DetectedFormSnapshot = {
      opid: "__form__cdp" as unknown as FormOpId,
      action: "",
      method: "",
      name: "CDP-detected form",
      fields: syntheticFields,
    };

    return {
      forms: [syntheticForm],
      mappings: mappingsWithThreshold,
      sessionId,
    };
  }

  private async processForms(
    forms: DetectedFormSnapshot[],
    _pageUrl: string,
    websiteContext: WebsiteContext,
  ): Promise<AutofillResult> {
    const startTime = performance.now();

    try {
      if (forms.length === 0) {
        return {
          success: true,
          mappings: [],
          processingTime: 0,
        };
      }

      const fields = forms.flatMap((form) => form.fields);

      const nonPasswordFields = fields.filter(
        (field) => field.metadata.fieldType !== "password",
      );

      const passwordFieldsCount = fields.length - nonPasswordFields.length;
      if (passwordFieldsCount > 0) {
        logger.info(`Filtered out ${passwordFieldsCount} password fields`);
      }

      const fieldsToProcess = nonPasswordFields.slice(0, MAX_FIELDS_PER_PAGE);
      if (fieldsToProcess.length < nonPasswordFields.length) {
        logger.warn(
          `Limited processing to ${MAX_FIELDS_PER_PAGE} fields out of ${nonPasswordFields.length}`,
        );
      }

      const allMemories = await storage.memories.getValue();

      if (allMemories.length === 0) {
        return {
          success: true,
          mappings: fieldsToProcess.map((field) =>
            createEmptyMapping<DetectedFieldSnapshot, FieldMapping>(
              field,
              "No stored memories available",
            ),
          ),
          processingTime: performance.now() - startTime,
        };
      }

      const memories = allMemories.slice(0, MAX_MEMORIES_FOR_MATCHING);
      const mappings = await this.matchFields(fields, memories, websiteContext);
      const allMappings = this.combineMappings(fieldsToProcess, mappings);
      const processingTime = performance.now() - startTime;

      logger.info(
        `Autofill completed in ${processingTime.toFixed(2)}ms: ${mappings.length} mappings`,
      );

      return {
        success: true,
        mappings: allMappings,
        processingTime,
      };
    } catch (error) {
      logger.error("Error processing fields:", error);
      return {
        success: false,
        mappings: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async matchFields(
    fields: DetectedFieldSnapshot[],
    memories: MemoryEntry[],
    websiteContext: WebsiteContext,
  ): Promise<FieldMapping[]> {
    if (fields.length === 0) {
      return [];
    }

    const compressedFields = fields.map((f) => this.compressField(f));
    const compressedMemories = memories.map((m) => this.compressMemory(m));

    const settings = this.currentAiSettings;

    if (!settings) {
      throw new Error("AI settings not loaded");
    }

    const useCloudMode = settings.cloudModelsEnabled;

    try {
      if (useCloudMode) {
        const authService = getAuthService();
        const session = await authService.getSession();

        if (!session?.access_token) {
          logger.warn(
            "Cloud models enabled but user not authenticated, using BYOK/fallback",
          );
          const provider = settings.selectedProvider;
          if (!provider) {
            return await this.fallbackMatcher.matchFields(
              compressedFields,
              compressedMemories,
            );
          }
          const keyVaultService = getKeyVaultService();
          const apiKey = await keyVaultService.getKey(provider);
          if (!apiKey) {
            return await this.fallbackMatcher.matchFields(
              compressedFields,
              compressedMemories,
            );
          }
          return await this.aiMatcher.matchFields(
            compressedFields,
            compressedMemories,
            websiteContext,
            false,
            provider,
            apiKey,
            settings.selectedModels?.[provider],
          );
        }

        logger.info("AutofillService: Using cloud AI mode");
        return await this.aiMatcher.matchFields(
          compressedFields,
          compressedMemories,
          websiteContext,
          true,
        );
      }

      const provider = settings.selectedProvider;

      if (!provider) {
        throw new Error(ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED);
      }

      const selectedModel = settings.selectedModels?.[provider];

      logger.info(
        "AutofillService: Using AI provider",
        provider,
        "with model",
        selectedModel,
      );

      const keyVaultService = getKeyVaultService();
      const apiKey = await keyVaultService.getKey(provider);

      if (!apiKey) {
        logger.warn("No API key found, using fallback matcher");
        return await this.fallbackMatcher.matchFields(
          compressedFields,
          compressedMemories,
        );
      }

      return await this.aiMatcher.matchFields(
        compressedFields,
        compressedMemories,
        websiteContext,
        false,
        provider,
        apiKey,
        settings.selectedModels?.[provider],
      );
    } catch (error) {
      logger.error("AI matching failed, using fallback:", error);
      return await this.fallbackMatcher.matchFields(
        compressedFields,
        compressedMemories,
      );
    }
  }

  private compressField(field: DetectedFieldSnapshot): CompressedFieldData {
    const allLabels = [
      field.metadata.labelTag,
      field.metadata.labelAria,
      field.metadata.labelData,
      field.metadata.labelLeft,
      field.metadata.labelTop,
    ].filter(Boolean) as string[];

    const labels = Array.from(new Set(allLabels));
    const contextParts = [
      field.metadata.placeholder,
      field.metadata.helperText,
    ];

    if (field.metadata.name && !isCrypticString(field.metadata.name)) {
      contextParts.push(field.metadata.name);
    }
    if (field.metadata.id && !isCrypticString(field.metadata.id)) {
      contextParts.push(field.metadata.id);
    }

    const context = contextParts.filter(Boolean).join(" ");

    const includeOptions =
      field.metadata.fieldType === "select" ||
      field.metadata.fieldType === "radio" ||
      field.metadata.fieldType === "checkbox";

    return {
      opid: field.opid,
      highlightIndex: field.highlightIndex,
      type: field.metadata.fieldType,
      purpose: field.metadata.fieldPurpose,
      labels,
      context,
      ...(includeOptions && field.metadata.options
        ? { options: field.metadata.options }
        : {}),
    };
  }

  private compressMemory(memory: MemoryEntry): CompressedMemoryData {
    return {
      id: memory.id,
      question: memory.question || "",
      answer: memory.answer,
      category: memory.category,
    };
  }

  private combineMappings(
    originalFields: DetectedFieldSnapshot[],
    mappings: FieldMapping[],
  ): FieldMapping[] {
    const mappingMap = new Map<string, FieldMapping>();

    for (const mapping of mappings) {
      mappingMap.set(mapping.fieldOpid, mapping);
    }

    return originalFields.map((field) => {
      const mapping = mappingMap.get(field.opid);
      if (!mapping) {
        return createEmptyMapping<DetectedFieldSnapshot, FieldMapping>(
          field,
          "No mapping generated",
        );
      }
      return mapping;
    });
  }

  private buildPreviewPayload(
    forms: DetectedFormSnapshot[],
    processingResult: AutofillResult,
    sessionId: string,
  ): PreviewSidebarPayload {
    const confidenceThreshold =
      this.currentAiSettings?.confidenceThreshold ?? 0.6;

    logger.info(
      `Applying confidence threshold: ${confidenceThreshold} to ${processingResult.mappings.length} mappings`,
    );

    const mappingsWithThreshold = processingResult.mappings.map((mapping) => {
      const meetsThreshold =
        mapping.value !== null && mapping.confidence >= confidenceThreshold;

      if (mapping.value !== null) {
        logger.info(
          `Field ${mapping.fieldOpid}: confidence=${mapping.confidence}, threshold=${confidenceThreshold}, autoFill=${meetsThreshold}`,
        );
      }

      return {
        ...mapping,
        autoFill: meetsThreshold,
      };
    });

    const autoEnabledCount = mappingsWithThreshold.filter(
      (m) => m.autoFill,
    ).length;

    logger.info(
      `${autoEnabledCount} of ${mappingsWithThreshold.length} fields auto-enabled based on threshold`,
      mappingsWithThreshold,
    );

    return {
      forms,
      mappings: mappingsWithThreshold,
      processingTime: processingResult.processingTime,
      sessionId,
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }
}

export const [registerAutofillService, getAutofillService] = defineProxyService(
  "AutofillService",
  () => new AutofillService(),
);
