import { MIN_FIELD_QUALITY } from "@/lib/autofill/constants";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
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
  DetectFormsResult,
  FieldMetadata,
  FieldOpId,
  FormFieldElement,
  FormOpId,
} from "@/types/autofill";
import type { FieldAnalyzer } from "./field-analyzer";
import { DOM_CACHE } from "./field-analyzer";

const logger = createLogger("form-detection-service");
const ignoredTypes = new Set([
  "hidden",
  "submit",
  "reset",
  "button",
  "image",
  "file",
  "color",
  "range",
]);

const createFrameScope = (): string => {
  const prefix = window.self === window.top ? "main" : "child";
  const random =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);

  return `${prefix}_${random}`;
};

export class FormDetectionService {
  private fieldOpidCounter = 0;
  private formOpidCounter = 0;
  private globalHighlightIndex = 0;
  private fieldCache = new Map<FieldOpId, DetectedField>();
  private formCache = new Map<FormOpId, DetectedForm>();
  private detectedElements = new Set<FormFieldElement>();
  private shadowRootFields: DetectedField[] = [];
  private readonly frameScope = createFrameScope();

  constructor(
    private analyzer: FieldAnalyzer,
    private contextExtractor: WebsiteContextExtractor,
  ) {}

  initialize(): void {
    const frameInfo = this.getFrameInfo();
    logger.info("Initializing FormDetectionService:", frameInfo);

    contentAutofillMessaging.onMessage(
      "detectForms",
      async (): Promise<DetectFormsResult> => {
        return await this.detectFormsInCurrentFrame();
      },
    );

    contentAutofillMessaging.onMessage(
      "collectAllFrameForms",
      async ({ data }: { data: { requestId: string } }) => {
        const result = await this.detectFormsInCurrentFrame();
        await contentAutofillMessaging.sendMessage("frameFormsDetected", {
          requestId: data.requestId,
          result,
        });
      },
    );

    logger.info("FormDetectionService initialized");
  }

  async detectFormsInCurrentFrame(): Promise<DetectFormsResult> {
    const frameInfo = this.getFrameInfo();

    try {
      DOM_CACHE.clear();
      this.analyzer.clearCaches();
      this.detectedElements.clear();
      this.shadowRootFields = [];
      this.globalHighlightIndex = 0;
      this.fieldCache.clear();
      this.formCache.clear();

      const forms = this.detectAll();
      const processedForms = this.filterAndProcessForms(forms);

      this.updateCaches(processedForms);

      const iframeOffset = this.getIframeOffset(frameInfo);
      const serializedForms = this.serializeForms(processedForms, iframeOffset);
      const totalFields = processedForms.reduce(
        (sum, form) => sum + form.fields.length,
        0,
      );
      const websiteContext = this.contextExtractor.extract();

      logger.info(
        `Detected ${processedForms.length} forms with ${totalFields} fields (opid counter at ${this.fieldOpidCounter})`,
      );

      return {
        success: true,
        forms: serializedForms,
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
      } as DetectFormsResult;
    }
  }

  private detectAll(): DetectedForm[] {
    const forms: DetectedForm[] = [];
    const formElements = this.findFormElements();

    for (const formElement of formElements) {
      const formOpid =
        `__form__${this.frameScope}_${this.formOpidCounter++}` as FormOpId;
      const fields = this.findFieldsInForm(formElement);
      const formName =
        formElement.getAttribute("name") ||
        formElement.getAttribute("id") ||
        "";

      forms.push({
        opid: formOpid,
        element: formElement,
        action: formElement.action || "",
        method: formElement.method || "get",
        name: formName,
        fields: fields.map((f) => ({ ...f, formOpid })),
      });
    }

    const standaloneFields = this.findStandaloneFields(formElements);
    const allStandaloneFields = [...standaloneFields, ...this.shadowRootFields];

    if (allStandaloneFields.length > 0) {
      const standaloneFormOpid =
        `__form__${this.frameScope}_standalone_${this.formOpidCounter++}` as FormOpId;
      forms.push({
        opid: standaloneFormOpid,
        element: null,
        action: "",
        method: "",
        name: "Standalone Fields",
        fields: allStandaloneFields.map((f) => ({
          ...f,
          formOpid: standaloneFormOpid,
        })),
      });
    }

    this.assignHighlightIndices(forms);

    return forms;
  }

  private filterAndProcessForms(forms: DetectedForm[]): DetectedForm[] {
    const stats = createFilterStats();

    return forms
      .map((form) => {
        const seenLabels = new Set<string>();
        const filteredFields = form.fields.filter((field) => {
          stats.total++;

          const quality = scoreField(field.metadata);
          if (quality < MIN_FIELD_QUALITY) {
            stats.filtered++;
            stats.reasons.noQuality++;
            return false;
          }

          if (
            field.metadata.fieldPurpose === "unknown" &&
            !hasAnyLabel(field.metadata) &&
            !hasValidContext(field.metadata)
          ) {
            stats.filtered++;
            stats.reasons.unknownUnlabeled++;
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

        return { ...form, fields: filteredFields };
      })
      .filter((form) => form.fields.length > 0);
  }

  private updateCaches(forms: DetectedForm[]): void {
    for (const form of forms) {
      this.formCache.set(form.opid, form);
      for (const field of form.fields) {
        this.fieldCache.set(field.opid, field);
      }
    }
  }

  private serializeForms(
    forms: DetectedForm[],
    iframeOffset: { x: number; y: number },
  ): DetectedFormSnapshot[] {
    return forms.map((form) => ({
      opid: form.opid,
      action: form.action,
      method: form.method,
      name: form.name,
      fields: form.fields.map((field) => {
        const { rect, ...metadata } = field.metadata;
        const transformedRect = {
          x: (rect.x ?? 0) + iframeOffset.x,
          y: (rect.y ?? 0) + iframeOffset.y,
          width: rect.width,
          height: rect.height,
        };

        return {
          opid: field.opid,
          formOpid: field.formOpid,
          frameId: undefined,
          highlightIndex: field.highlightIndex,
          metadata: { ...metadata, rect: transformedRect },
        };
      }),
    }));
  }

  private assignHighlightIndices(forms: DetectedForm[]): void {
    for (const form of forms) {
      for (const field of form.fields) {
        const { isVisible, isTopElement, isInteractive } = field.metadata;
        if (isVisible && isTopElement && isInteractive) {
          field.highlightIndex = this.globalHighlightIndex++;
        } else {
          field.highlightIndex = null;
        }
      }
    }
  }

  private findFormElements(): HTMLFormElement[] {
    const forms: HTMLFormElement[] = [];
    const walker = this.createTreeWalker(
      document.documentElement,
      (node) => node.nodeName === "FORM",
    );

    let node: Node | null = walker.nextNode();
    while (node) {
      forms.push(node as HTMLFormElement);
      node = walker.nextNode();
    }

    return forms;
  }

  private findFieldsInForm(form: HTMLFormElement): DetectedField[] {
    const fields: DetectedField[] = [];

    for (const element of Array.from(form.elements)) {
      if (!this.isFieldElement(element)) {
        continue;
      }

      const fieldElement = element;

      if (
        !this.isValidField(fieldElement) ||
        this.detectedElements.has(fieldElement)
      ) {
        continue;
      }

      const detectedField = this.createDetectedField(fieldElement);
      fields.push(detectedField);
      this.markRelatedFields(fieldElement, detectedField.opid);
    }

    return fields;
  }

  private findStandaloneFields(
    existingForms: HTMLFormElement[],
  ): DetectedField[] {
    const fields: DetectedField[] = [];
    const walker = this.createTreeWalker(document.documentElement, (node) =>
      this.isFieldElement(node),
    );

    let node: Node | null = walker.nextNode();
    while (node) {
      const element = node as FormFieldElement;

      if (!element.form && !this.isInsideForm(element, existingForms)) {
        if (this.isValidField(element) && !this.detectedElements.has(element)) {
          const detectedField = this.createDetectedField(element);
          fields.push(detectedField);
          this.markRelatedFields(element, detectedField.opid);
        }
      }

      node = walker.nextNode();
    }

    return fields;
  }

  private createDetectedField(element: FormFieldElement): DetectedField {
    const opid =
      `__frame_${this.frameScope}__field_${this.fieldOpidCounter++}` as FieldOpId;

    const field: DetectedField = {
      opid,
      element,
      metadata: {} as FieldMetadata,
      formOpid: "" as FormOpId,
      highlightIndex: null,
    };

    field.metadata = this.analyzer.analyzeField(field);
    this.detectedElements.add(element);
    element.setAttribute("data-superfill-opid", opid);

    return field;
  }

  private createTreeWalker(
    root: Node,
    acceptNode: (node: Node) => boolean,
  ): TreeWalker {
    return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const element = node as Element;
        if (element.shadowRoot) {
          this.traverseShadowRoot(element.shadowRoot);
        }
        return acceptNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
  }

  private traverseShadowRoot(shadowRoot: ShadowRoot): void {
    const walker = document.createTreeWalker(
      shadowRoot,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const element = node as Element;
          if (element.shadowRoot) {
            this.traverseShadowRoot(element.shadowRoot);
          }
          return this.isFieldElement(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      },
    );

    let node: Node | null = walker.nextNode();
    while (node) {
      const element = node as FormFieldElement;

      if (this.isValidField(element) && !this.detectedElements.has(element)) {
        const detectedField = this.createDetectedField(element);
        this.shadowRootFields.push(detectedField);
        this.markRelatedFields(element, detectedField.opid);
      }

      node = walker.nextNode();
    }
  }

  private isValidField(element: HTMLElement): boolean {
    if (
      element.hasAttribute("data-bwignore") ||
      element instanceof HTMLButtonElement ||
      (element.offsetParent === null &&
        element.getAttribute("type") !== "hidden")
    ) {
      return false;
    }

    if (element instanceof HTMLInputElement) {
      if (ignoredTypes.has(element.type)) return false;
    }

    return true;
  }

  private isFieldElement(node: Node): node is FormFieldElement {
    if (!(node instanceof HTMLElement)) return false;
    const tagName = node.tagName.toLowerCase();
    return (
      tagName === "input" || tagName === "textarea" || tagName === "select"
    );
  }

  private markRelatedFields(element: FormFieldElement, opid: FieldOpId): void {
    if (!(element instanceof HTMLInputElement) || element.type !== "radio") {
      return;
    }

    for (const radio of this.getRadioGroupElements(element)) {
      this.detectedElements.add(radio);
      radio.setAttribute("data-superfill-opid", opid);
    }
  }

  private getRadioGroupElements(element: HTMLInputElement): HTMLInputElement[] {
    if (element.type !== "radio" || !element.name) {
      return [element];
    }

    const root = element.form ?? document;
    return Array.from(
      root.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(element.name)}"]`,
      ),
    );
  }

  private isInsideForm(element: Element, forms: HTMLFormElement[]): boolean {
    return forms.some((form) => form.contains(element));
  }

  private getFrameInfo() {
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
      } catch (error) {
        logger.debug(
          "Unable to read full frame depth:",
          error instanceof Error ? error.message : String(error),
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
  }

  private getIframeOffset(frameInfo: { isMainFrame: boolean }): {
    x: number;
    y: number;
  } {
    if (frameInfo.isMainFrame) return { x: 0, y: 0 };

    let x = 0;
    let y = 0;
    let currentWindow: Window = window;

    try {
      while (currentWindow !== currentWindow.top) {
        const frameElement = currentWindow.frameElement;
        if (!frameElement) break;

        const rect = frameElement.getBoundingClientRect();
        x += rect.left;
        y += rect.top;

        currentWindow = currentWindow.parent;
      }
    } catch (error) {
      logger.debug(
        "Unable to compute iframe offset:",
        error instanceof Error ? error.message : String(error),
      );
    }

    return { x, y };
  }

  getCachedField(fieldOpid: FieldOpId): DetectedField | null {
    return this.fieldCache.get(fieldOpid) ?? null;
  }

  getCachedForm(formOpid: FormOpId): DetectedForm | null {
    return this.formCache.get(formOpid) ?? null;
  }

  getCachedForms(): DetectedForm[] {
    return Array.from(this.formCache.values());
  }

  getCachedFields(): DetectedField[] {
    return Array.from(this.fieldCache.values());
  }

  getAllCachedFieldEntries(): Array<[FieldOpId, DetectedField]> {
    return Array.from(this.fieldCache.entries());
  }

  hasCachedForms(): boolean {
    return this.formCache.size > 0;
  }

  getCacheStats() {
    return {
      formCount: this.formCache.size,
      fieldCount: this.fieldCache.size,
      fieldOpidCounter: this.fieldOpidCounter,
      formOpidCounter: this.formOpidCounter,
    };
  }

  dispose(): void {
    this.fieldCache.clear();
    this.formCache.clear();
    logger.info("FormDetectionService disposed");
  }
}
