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
    this.shadowRootFields = [];
    this.detectedElements.clear();
    this.detectedRadioGroups.clear();
    
    const allFields = this.findAllFieldsInOrder();
    const forms: DetectedForm[] = [];
    if (allFields.length > 0) {
      forms.push({
        opid: "__form__all" as FormOpId,
        element: null,
        action: "",
        method: "",
        name: "",
        fields: allFields.map((f) => ({
          ...f,
          formOpid: "__form__all" as FormOpId,
        })),
      });
    }

    return forms;
  }

  private findAllFieldsInOrder(): DetectedField[] {
    const fields: DetectedField[] = [];
    const radioGroups = new Map<string, HTMLInputElement[]>();
    const processedRadioGroups = new Set<HTMLElement>();
    const processedDropdowns = new Set<HTMLElement>();

    const allElements: Array<{ element: Element; type: 'radiogroup' | 'dropdown' | 'regular' }> = [];

    const customRadioGroups = document.querySelectorAll('[role="radiogroup"]');
    for (const element of customRadioGroups) {
      allElements.push({ element, type: 'radiogroup' });
    }

    const customDropdowns = document.querySelectorAll('[role="listbox"], [role="combobox"]');
    for (const element of customDropdowns) {
      allElements.push({ element, type: 'dropdown' });
    }

    const regularFields = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]), textarea, select',
    );
    for (const element of regularFields) {
      allElements.push({ element, type: 'regular' });
    }

    allElements.sort((a, b) => {
      const position = a.element.compareDocumentPosition(b.element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    for (const { element, type } of allElements) {
      if (type === 'radiogroup' && !processedRadioGroups.has(element as HTMLElement)) {
        processedRadioGroups.add(element as HTMLElement);
        const radioOptions = element.querySelectorAll('[role="radio"]');
        if (radioOptions.length > 0) {
          const groupKey = element.getAttribute("aria-labelledby") || element.getAttribute("aria-label") || element.getAttribute("id") || `custom_radio_${this.fieldOpidCounter}`;
          
          if (!this.detectedRadioGroups.has(groupKey)) {
            this.detectedRadioGroups.add(groupKey);
            
            let groupLabel: string | null = null;
            const labelledBy = element.getAttribute("aria-labelledby");
            if (labelledBy) {
              const ids = labelledBy.trim().split(/\s+/);
              
              for (const id of ids) {
                const labelElement = document.getElementById(id);
                if (labelElement && labelElement.textContent?.trim()) {
                  groupLabel = labelElement.textContent.trim();
                  break;
                }
              }
            }
            if (!groupLabel) {
              groupLabel = element.getAttribute("aria-label");
            }
            
            const field = this.createCustomRadioGroupField(
              Array.from(radioOptions) as HTMLElement[], 
              groupKey, 
              groupLabel
            );
            if (field) {
              fields.push(field);
            }
          }
        }
      } else if (type === 'dropdown' && !processedDropdowns.has(element as HTMLElement)) {
        processedDropdowns.add(element as HTMLElement);
        const field = this.createCustomDropdownField(element as HTMLElement);
        if (field) {
          fields.push(field);
        }
      } else if (type === 'regular') {
        const formElement = element as FormFieldElement;
        
        if (this.detectedElements.has(formElement)) {
          continue;
        }

        if (formElement instanceof HTMLInputElement && formElement.type === "radio") {
          if (this.isValidField(formElement)) {
            const name = formElement.name;
            if (name) {
              const group = radioGroups.get(name) ?? [];
              group.push(formElement);
              radioGroups.set(name, group);
            }
          }
        } else if (formElement instanceof HTMLInputElement || formElement instanceof HTMLTextAreaElement || formElement instanceof HTMLSelectElement) {
          if (this.isValidField(formElement)) {
            fields.push(this.createDetectedField(formElement));
          }
        }
      }
    }

    for (const [groupName, radios] of radioGroups) {
      const groupKey = `native_${groupName}`;
      if (!this.detectedRadioGroups.has(groupKey)) {
        this.detectedRadioGroups.add(groupKey);
        const field = this.createRadioGroupField(radios);
        if (field) {
          fields.push(field);
        }
      }
    }

    return fields;
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

    const roleForms = document.querySelectorAll('[role="form"]');
    for (const roleForm of roleForms) {
      forms.push(roleForm as HTMLFormElement);
    }

    return forms;
  }

  private findFieldsInForm(form: HTMLFormElement): DetectedField[] {
    const fields: DetectedField[] = [];
    const radioGroups = new Map<string, HTMLInputElement[]>();

    for (const element of Array.from(form.elements)) {
      const fieldElement = element as FormFieldElement;

      if (
        !this.isValidField(fieldElement) ||
        this.detectedElements.has(fieldElement)
      ) {
        continue;
      }

      if (
        fieldElement instanceof HTMLInputElement &&
        fieldElement.type === "radio"
      ) {
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
    const processedRadioGroups = new Set<HTMLElement>();
    const processedDropdowns = new Set<HTMLElement>();

    const customRadioGroups = document.querySelectorAll('[role="radiogroup"]');
    for (const element of customRadioGroups) {
      if (!processedRadioGroups.has(element as HTMLElement)) {
        processedRadioGroups.add(element as HTMLElement);
        const radioOptions = element.querySelectorAll('[role="radio"]');
        if (radioOptions.length > 0) {
          const groupKey = element.getAttribute("aria-labelledby") || element.getAttribute("aria-label") || element.getAttribute("id") || `custom_radio_${this.fieldOpidCounter}`;
          
          if (!this.detectedRadioGroups.has(groupKey)) {
            this.detectedRadioGroups.add(groupKey);
            
            let groupLabel: string | null = null;
            const labelledBy = element.getAttribute("aria-labelledby");
            if (labelledBy) {
              const ids = labelledBy.trim().split(/\s+/);
              
              for (const id of ids) {
                const labelElement = document.getElementById(id);
                if (labelElement && labelElement.textContent?.trim()) {
                  groupLabel = labelElement.textContent.trim();
                  break;
                }
              }
            }
            if (!groupLabel) {
              groupLabel = element.getAttribute("aria-label");
            }
            
            const field = this.createCustomRadioGroupField(
              Array.from(radioOptions) as HTMLElement[], 
              groupKey,
              groupLabel
            );
            if (field) {
              fields.push(field);
            }
          }
        }
      }
    }

    const customDropdowns = document.querySelectorAll('[role="listbox"], [role="combobox"]');
    for (const element of customDropdowns) {
      if (!processedDropdowns.has(element as HTMLElement)) {
        processedDropdowns.add(element as HTMLElement);
        const field = this.createCustomDropdownField(element as HTMLElement);
        if (field) {
          fields.push(field);
        }
      }
    }

    const regularFields = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]), textarea, select',
    );

    for (const element of regularFields) {
      if (this.isInsideForm(element, existingForms)) {
        continue;
      }

      if (element instanceof HTMLInputElement && element.type === "radio") {
        if (this.isValidField(element) && !this.detectedElements.has(element)) {
          const name = element.name;
          if (name) {
            const group = radioGroups.get(name) ?? [];
            group.push(element);
            radioGroups.set(name, group);
          }
        }
      } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        if (this.isValidField(element) && !this.detectedElements.has(element)) {
          fields.push(this.createDetectedField(element));
        }
      }
    }

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
    if (element.hasAttribute("data-bwignore") || element instanceof HTMLButtonElement) {
      return false;
    }

    const role = element.getAttribute("role");
    if (role === "radiogroup" || role === "listbox" || role === "combobox") {
      return true;
    }

    if (
      element.offsetParent === null &&
      element.getAttribute("type") !== "hidden" &&
      !role
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
    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      return true;
    }

    const role = node.getAttribute("role");
    const customFieldRoles = [
      "combobox",
      "listbox",
      "textbox",
      "searchbox",
      "radiogroup",
      "checkbox",
      "spinbutton",
      "slider",
    ];

    return role !== null && customFieldRoles.includes(role);
  }

  private isInsideForm(element: Element, forms: HTMLFormElement[]): boolean {
    return forms.some((form) => form.contains(element));
  }

  private createRadioGroupField(
    radios: HTMLInputElement[],
  ): DetectedField | null {
    if (radios.length === 0) return null;

    const primaryRadio = radios[0];
    const existingOpid = primaryRadio.getAttribute("data-superfill-opid");
    const opid = existingOpid
      ? (existingOpid as FieldOpId)
      : (`__${this.fieldOpidCounter++}` as FieldOpId);

    if (!existingOpid) {
      primaryRadio.setAttribute("data-superfill-opid", opid);
    }

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

    field.metadata = this.analyzer.analyzeField(field);

    field.metadata.options = radios.map((radio) => ({
      value: radio.value,
      label: this.getRadioLabel(radio),
      element: radio,
    }));

    return field;
  }

  private getRadioLabel(radio: HTMLInputElement): string | null {
    if (radio.id) {
      const label = document.querySelector<HTMLLabelElement>(
        `label[for="${radio.id}"]`,
      );
      if (label) {
        return label.textContent?.trim() || null;
      }
    }

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

    if (element instanceof HTMLSelectElement && element.options.length > 0) {
      field.metadata.options = Array.from(element.options).map((option) => ({
        value: option.value,
        label: option.text || option.value,
        element: element as unknown as HTMLInputElement,
      }));
    }

    this.detectedElements.add(element);

    return field;
  }

  private createCustomRadioGroupField(
    radioElements: HTMLElement[],
    groupKey: string,
    groupLabel: string | null,
  ): DetectedField | null {
    if (radioElements.length === 0) return null;

    const primaryElement = radioElements[0];
    
    const existingOpid = primaryElement.getAttribute('data-superfill-opid');
    if (existingOpid) {
      return null;
    }
    
    const opid = `__${this.fieldOpidCounter++}` as FieldOpId;

    for (const radio of radioElements) {
      radio.setAttribute("data-superfill-opid", opid);
      this.detectedElements.add(radio as unknown as FormFieldElement);
    }

    const field: DetectedField = {
      opid,
      element: primaryElement as unknown as FormFieldElement,
      metadata: {} as FieldMetadata,
      formOpid: "" as FormOpId,
    };

    field.metadata = this.analyzer.analyzeField(field);
    field.metadata.fieldType = "radio";

    if (groupLabel) {
      field.metadata.labelTag = groupLabel;
      field.metadata.labelAria = groupLabel;
      field.metadata.labelTop = null;
      field.metadata.labelLeft = null;
    }

    field.metadata.options = radioElements.map((radio) => {
      const label = radio.getAttribute("aria-label") || radio.textContent?.trim() || "";
      const value = radio.getAttribute("data-value") || label;
      return {
        value: value,
        label: label || null,
        element: radio as unknown as HTMLInputElement,
      };
    });

    return field;
  }

  private createCustomDropdownField(
    dropdownElement: HTMLElement,
  ): DetectedField | null {
    const existingOpid = dropdownElement.getAttribute('data-superfill-opid');
    if (existingOpid) {
      return null;
    }
    
    const opid = `__${this.fieldOpidCounter++}` as FieldOpId;
    
    dropdownElement.setAttribute("data-superfill-opid", opid);
    this.detectedElements.add(dropdownElement as unknown as FormFieldElement);

    const field: DetectedField = {
      opid,
      element: dropdownElement as unknown as FormFieldElement,
      metadata: {} as FieldMetadata,
      formOpid: "" as FormOpId,
    };

    field.metadata = this.analyzer.analyzeField(field);
    field.metadata.fieldType = "select";

    const listboxId = dropdownElement.getAttribute("aria-owns") || dropdownElement.getAttribute("aria-controls");
    let optionsContainer: Element | null = null;

    if (listboxId) {
      optionsContainer = document.getElementById(listboxId);
    }

    if (!optionsContainer) {
      optionsContainer = dropdownElement.querySelector('[role="listbox"]');
    }

    if (!optionsContainer) {
      const parentContainer = dropdownElement.closest('[role="listbox"], [jsname], [data-list-box], .quantumWizMenuPaperselectContent');
      if (parentContainer) {
        optionsContainer = parentContainer;
      }
    }

    if (!optionsContainer) {
      const parent = dropdownElement.parentElement;
      if (parent) {
        const selectElem = parent.querySelector('select');
        if (selectElem && selectElem.options.length > 0) {
          field.metadata.options = Array.from(selectElem.options).map((option) => {
            return {
              value: option.value || option.textContent?.trim() || "",
              label: option.textContent?.trim() || null,
              element: dropdownElement as unknown as HTMLInputElement,
            };
          });
          return field;
        }

        const optionElements = parent.querySelectorAll('[role="option"], [data-value]');
        if (optionElements.length > 0) {
          optionsContainer = parent;
        }
      }
    }

    if (optionsContainer) {
      const options = optionsContainer.querySelectorAll('[role="option"]');
      field.metadata.options = Array.from(options).map((option) => {
        const label = option.getAttribute("aria-label") || option.textContent?.trim() || "";
        const value = option.getAttribute("data-value") || label;
        return {
          value: value,
          label: label || null,
          element: dropdownElement as unknown as HTMLInputElement,
        };
      });
    }

    return field;
  }
}
