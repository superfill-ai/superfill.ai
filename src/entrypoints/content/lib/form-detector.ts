import type {
  DetectedField,
  DetectedForm,
  FieldMetadata,
  FieldOpId,
  FormFieldElement,
  FormOpId,
} from "@/types/autofill";
import type { FieldAnalyzer } from "./field-analyzer";

export class FormDetector {
  private formOpidCounter = 0;
  private fieldOpidCounter = 0;
  private shadowRootFields: DetectedField[] = [];
  private detectedElements = new Set<FormFieldElement>();
  private detectedRadioGroups = new Set<string>();

  constructor(private analyzer: FieldAnalyzer) {}

  private ignoredTypes = new Set([
    "hidden",
    "submit",
    "reset",
    "button",
    "image",
    "file",
  ]);

  detectAll(): DetectedForm[] {
    const forms: DetectedForm[] = [];
    this.shadowRootFields = [];
    this.detectedElements.clear();
    this.detectedRadioGroups.clear();

    const formElements = this.findFormElements();

    for (const formElement of formElements) {
      const formOpid = `__form__${this.formOpidCounter++}` as FormOpId;
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
        fields: fields.map((f) => ({
          ...f,
          formOpid,
        })),
      });
    }

    const standaloneFields = this.findStandaloneFields(formElements);
    const allStandaloneFields = [...standaloneFields, ...this.shadowRootFields];

    if (allStandaloneFields.length > 0) {
      forms.push({
        opid: "__form__standalone" as FormOpId,
        element: null,
        action: "",
        method: "",
        name: "Standalone Fields",
        fields: allStandaloneFields.map((f) => ({
          ...f,
          formOpid: "__form__standalone" as FormOpId,
        })),
      });
    }

    return forms;
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
    const radioGroups = new Map<string, HTMLInputElement[]>();

    // First pass: collect radio buttons into groups, add other fields directly
    for (const element of Array.from(form.elements)) {
      const fieldElement = element as FormFieldElement;
      
      if (!this.isValidField(fieldElement) || this.detectedElements.has(fieldElement)) {
        continue;
      }

      // Group radio buttons by name
      if (fieldElement instanceof HTMLInputElement && fieldElement.type === "radio") {
        const name = fieldElement.name;
        if (name) {
          const group = radioGroups.get(name) ?? [];
          group.push(fieldElement);
          radioGroups.set(name, group);
        }
        continue;
      }

      fields.push(this.createDetectedField(fieldElement));
    }

    // Second pass: create one field per radio group
    for (const [groupName, radios] of radioGroups) {
      const groupKey = `${form.name || form.id || "form"}_${groupName}`;
      if (this.detectedRadioGroups.has(groupKey)) {
        continue;
      }
      this.detectedRadioGroups.add(groupKey);

      const field = this.createRadioGroupField(radios);
      if (field) {
        fields.push(field);
      }
    }

    return fields;
  }

  private findStandaloneFields(
    existingForms: HTMLFormElement[],
  ): DetectedField[] {
    const fields: DetectedField[] = [];
    const radioGroups = new Map<string, HTMLInputElement[]>();
    const walker = this.createTreeWalker(document.documentElement, (node) =>
      this.isFieldElement(node),
    );

    let node: Node | null = walker.nextNode();
    while (node) {
      const element = node as FormFieldElement;

      if (!element.form && !this.isInsideForm(element, existingForms)) {
        if (this.isValidField(element) && !this.detectedElements.has(element)) {
          // Group radio buttons by name
          if (element instanceof HTMLInputElement && element.type === "radio") {
            const name = element.name;
            if (name) {
              const group = radioGroups.get(name) ?? [];
              group.push(element);
              radioGroups.set(name, group);
            }
          } else {
            fields.push(this.createDetectedField(element));
          }
        }
      }

      node = walker.nextNode();
    }

    // Create one field per radio group
    for (const [groupName, radios] of radioGroups) {
      const groupKey = `standalone_${groupName}`;
      if (this.detectedRadioGroups.has(groupKey)) {
        continue;
      }
      this.detectedRadioGroups.add(groupKey);

      const field = this.createRadioGroupField(radios);
      if (field) {
        fields.push(field);
      }
    }

    return fields;
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

  private traverseShadowRoot(shadowRoot: ShadowRoot) {
    const radioGroups = new Map<string, HTMLInputElement[]>();
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
        // Group radio buttons by name
        if (element instanceof HTMLInputElement && element.type === "radio") {
          const name = element.name;
          if (name) {
            const group = radioGroups.get(name) ?? [];
            group.push(element);
            radioGroups.set(name, group);
          }
        } else {
          this.shadowRootFields.push(this.createDetectedField(element));
        }
      }

      node = walker.nextNode();
    }

    // Create one field per radio group
    for (const [groupName, radios] of radioGroups) {
      const groupKey = `shadow_${groupName}`;
      if (this.detectedRadioGroups.has(groupKey)) {
        continue;
      }
      this.detectedRadioGroups.add(groupKey);

      const field = this.createRadioGroupField(radios);
      if (field) {
        this.shadowRootFields.push(field);
      }
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
      if (this.ignoredTypes.has(element.type)) {
        return false;
      }
    }

    return true;
  }

  private isFieldElement(node: Node): boolean {
    if (!(node instanceof HTMLElement)) return false;

    const tagName = node.tagName.toLowerCase();
    return (
      tagName === "input" || tagName === "textarea" || tagName === "select"
    );
  }

  private isInsideForm(element: Element, forms: HTMLFormElement[]): boolean {
    return forms.some((form) => form.contains(element));
  }

  private createRadioGroupField(radios: HTMLInputElement[]): DetectedField | null {
    if (radios.length === 0) return null;

    // Use the first radio as the primary element
    const primaryRadio = radios[0];
    const existingOpid = primaryRadio.getAttribute("data-superfill-opid");
    const opid = existingOpid
      ? (existingOpid as FieldOpId)
      : (`__${this.fieldOpidCounter++}` as FieldOpId);

    if (!existingOpid) {
      primaryRadio.setAttribute("data-superfill-opid", opid);
    }

    // Mark all radios in the group with the same opid for filling
    for (const radio of radios) {
      radio.setAttribute("data-superfill-opid", opid);
      this.detectedElements.add(radio);
    }

    const field: DetectedField = {
      opid,
      element: primaryRadio,
      metadata: {} as FieldMetadata,
      formOpid: "" as FormOpId,
    };

    // Analyze using the first radio, then add options
    field.metadata = this.analyzer.analyzeField(field);
    
    // Add all radio options to metadata
    field.metadata.options = radios.map((radio) => ({
      value: radio.value,
      label: this.getRadioLabel(radio),
      element: radio,
    }));

    return field;
  }

  private getRadioLabel(radio: HTMLInputElement): string | null {
    // Check for explicit label
    if (radio.id) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${radio.id}"]`);
      if (label) {
        return label.textContent?.trim() || null;
      }
    }

    // Check for parent label
    const parentLabel = radio.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as HTMLLabelElement;
      const inputs = clone.querySelectorAll("input");
      for (const input of Array.from(inputs)) {
        input.remove();
      }
      const text = clone.textContent?.trim();
      if (text) return text;
    }

    // Fall back to value
    return radio.value || null;
  }

  private createDetectedField(element: FormFieldElement): DetectedField {
    const existingOpid = element.getAttribute("data-superfill-opid");
    const opid = existingOpid
      ? (existingOpid as FieldOpId)
      : (`__${this.fieldOpidCounter++}` as FieldOpId);

    if (!existingOpid) {
      element.setAttribute("data-superfill-opid", opid);
    }

    const field: DetectedField = {
      opid,
      element,
      metadata: {} as FieldMetadata,
      formOpid: "" as FormOpId,
    };

    field.metadata = this.analyzer.analyzeField(field);
    this.detectedElements.add(element);

    return field;
  }
}
