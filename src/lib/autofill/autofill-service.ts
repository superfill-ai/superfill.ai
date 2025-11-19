import { defineProxyService } from "@webext-core/proxy-service";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import { getSessionService } from "@/lib/autofill/session-service";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type {
  AutofillResult,
  CompressedFieldData,
  CompressedMemoryData,
  DetectedFieldSnapshot,
  DetectedFormSnapshot,
  FieldMapping,
  PreviewSidebarPayload,
} from "@/types/autofill";
import type { WebsiteContext } from "@/types/context";
import type { MemoryEntry } from "@/types/memory";
import type { AISettings } from "@/types/settings";
import { ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED } from "../errors";
import { aiSettings } from "../storage/ai-settings";
import { AIMatcher } from "./ai-matcher";
import { MAX_FIELDS_PER_PAGE, MAX_MEMORIES_FOR_MATCHING } from "./constants";
import { FallbackMatcher } from "./fallback-matcher";
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

  async startAutofillOnActiveTab(apiKey?: string): Promise<{
    success: boolean;
    fieldsDetected: number;
    mappingsFound: number;
    error?: string;
  }> {
    let sessionId: string | undefined;
    let tabId: number | undefined;
    const sessionService = getSessionService();

    logger.info("Starting autofill with API key present:", !!apiKey);

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

      const result = await contentAutofillMessaging.sendMessage(
        "detectForms",
        undefined,
        tabId,
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to detect forms");
      }

      logger.info(
        `Detected ${result.totalFields} fields in ${result.forms.length} forms`,
      );

      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        {
          state: "analyzing",
          message: "Analyzing fields...",
          fieldsDetected: result.totalFields,
        },
        tabId,
      );

      await sessionService.updateSessionStatus(sessionId, "matching");

      const forms = result.forms;
      const allFields = forms.flatMap((form) => form.fields);
      const pageUrl = tab.url || "";

      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        {
          state: "matching",
          message: "Matching memories...",
          fieldsDetected: result.totalFields,
        },
        tabId,
      );

      const processingResult = await this.processForms(
        forms,
        pageUrl,
        result.websiteContext,
        apiKey,
      );

      logger.info("Autofill processing result:", processingResult);

      const matchedCount = processingResult.mappings.filter(
        (mapping) => mapping.memoryId !== null,
      ).length;

      await sessionService.updateSessionStatus(sessionId, "reviewing");

      await contentAutofillMessaging.sendMessage(
        "updateProgress",
        {
          state: "showing-preview",
          message: "Preparing preview...",
          fieldsDetected: result.totalFields,
          fieldsMatched: matchedCount,
        },
        tabId,
      );

      try {
        await contentAutofillMessaging.sendMessage(
          "showPreview",
          this.buildPreviewPayload(forms, processingResult, sessionId),
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
        fieldsDetected: result.totalFields,
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

  private async processForms(
    forms: DetectedFormSnapshot[],
    _pageUrl: string,
    websiteContext: WebsiteContext,
    apiKey?: string,
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
      const mappings = await this.matchFields(
        fields,
        memories,
        websiteContext,
        apiKey,
      );
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
    apiKey?: string,
  ): Promise<FieldMapping[]> {
    if (fields.length === 0) {
      return [];
    }

    const compressedFields = fields.map((f) => this.compressField(f));
    const compressedMemories = memories.map((m) => this.compressMemory(m));

    try {
      const settings = this.currentAiSettings;
      if (!settings) {
        throw new Error("AI settings not loaded");
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
        provider,
        apiKey,
        selectedModel,
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
      field.metadata.labelRight,
      field.metadata.labelTop,
    ].filter(Boolean) as string[];

    const labels = Array.from(new Set(allLabels));

    const context = [
      field.metadata.placeholder,
      field.metadata.helperText,
      field.metadata.name,
      field.metadata.id,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      opid: field.opid,
      type: field.metadata.fieldType,
      purpose: field.metadata.fieldPurpose,
      labels,
      context,
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
        mapping.memoryId !== null &&
        mapping.value !== null &&
        mapping.confidence >= confidenceThreshold;

      if (mapping.memoryId !== null) {
        logger.debug(
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
