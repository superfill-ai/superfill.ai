import type { FormDetector } from "@/entrypoints/content/lib/form-detector";
import { MIN_FIELD_QUALITY } from "@/lib/autofill/constants";
import {
  createFilterStats,
  getPrimaryLabel,
  hasAnyLabel,
  hasValidContext,
  scoreField,
} from "@/lib/autofill/field-quality";
import type { WebsiteContextExtractor } from "@/lib/context/website-context-extractor";
import { createLogger } from "@/lib/logger";
import type {
  DetectedField,
  DetectedForm,
  DetectedFormSnapshot,
  FieldOpId,
  FormOpId,
} from "@/types/autofill";

const logger = createLogger("iframe-handling");

export interface FrameInfo {
  isMainFrame: boolean;
  frameUrl: string;
  parentUrl: string;
  frameDepth: number;
}

export interface FormCollectionResult {
  success: boolean;
  forms: DetectedFormSnapshot[];
  totalFields: number;
  websiteContext?: ReturnType<WebsiteContextExtractor["extract"]>;
  frameInfo: FrameInfo;
  error?: string;
}

export const getFrameInfo = (): FrameInfo => {
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
    } catch (_crossOriginError) {
      logger.debug(
        "Cross-origin access error while calculating frame depth, stopping at depth:",
        depth,
      );
    }
    return depth;
  };

  return {
    isMainFrame,
    frameUrl,
    parentUrl,
    frameDepth: getFrameDepth(),
  };
};

export const serializeForms = (
  forms: DetectedForm[],
  frameId?: number,
): DetectedFormSnapshot[] =>
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
        frameId,
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

export const filterAndProcessForms = (
  allForms: DetectedForm[],
): DetectedForm[] => {
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

  return forms;
};

export const collectFrameForms = async (
  formDetector: FormDetector,
  contextExtractor: WebsiteContextExtractor,
  frameInfo: FrameInfo,
): Promise<FormCollectionResult> => {
  try {
    const allForms = formDetector.detectAll();
    const forms = filterAndProcessForms(allForms);
    const serializedForms = serializeForms(forms, undefined);

    const totalFields = forms.reduce(
      (sum, form) => sum + form.fields.length,
      0,
    );

    const websiteContext = contextExtractor.extract();

    logger.debug(
      `Frame ${frameInfo.isMainFrame ? "main" : "iframe"} (depth: ${frameInfo.frameDepth}) detected ${forms.length} forms with ${totalFields} fields`,
    );

    return {
      success: true,
      forms: serializedForms,
      totalFields,
      websiteContext,
      frameInfo,
    };
  } catch (error) {
    logger.error("Error detecting forms in frame:", error);
    return {
      success: false,
      forms: [],
      totalFields: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      frameInfo,
    };
  }
};

export const cacheDetectedForms = (
  forms: DetectedForm[],
  formCache: Map<FormOpId, DetectedForm>,
  fieldCache: Map<FieldOpId, DetectedField>,
): void => {
  formCache.clear();
  fieldCache.clear();

  for (const form of forms) {
    formCache.set(form.opid, form);

    for (const field of form.fields) {
      fieldCache.set(field.opid, field);
    }
  }
};
