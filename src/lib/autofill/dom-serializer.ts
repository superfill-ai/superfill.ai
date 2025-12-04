/**
 * DOM Serializer for Form Context Extraction
 *
 * Creates a minimal, semantic representation of form DOM structure
 * optimized for LLM understanding (~1000 tokens max).
 */

const MAX_SERIALIZED_LENGTH = 4000; // ~1000 tokens

const ELEMENTS_TO_STRIP = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "canvas",
  "video",
  "audio",
  "picture",
  "source",
  "track",
  "map",
  "area",
]);

const NOISE_SELECTORS = [
  "header",
  "footer",
  "nav",
  ".nav",
  ".navigation",
  ".header",
  ".footer",
  ".sidebar",
  ".menu",
  ".ads",
  ".advertisement",
  ".cookie",
  ".popup",
  ".modal",
  '[role="banner"]',
  '[role="navigation"]',
  '[role="contentinfo"]',
];

const SEMANTIC_ELEMENTS = new Set([
  "form",
  "fieldset",
  "legend",
  "label",
  "input",
  "textarea",
  "select",
  "option",
  "optgroup",
  "button",
  "datalist",
  "output",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "div",
  "section",
  "article",
  "main",
]);

const RELEVANT_ATTRIBUTES = new Set([
  "type",
  "name",
  "id",
  "placeholder",
  "value",
  "for",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "required",
  "disabled",
  "readonly",
  "checked",
  "selected",
  "multiple",
  "autocomplete",
  "pattern",
  "min",
  "max",
  "step",
  "maxlength",
  "minlength",
  "role",
]);

interface SerializeOptions {
  maxLength?: number;
  includeNearbyContext?: boolean;
}

/**
 * Serializes a form element and its surrounding context into a minimal DOM representation
 */
export function serializeFormContext(
  formElement: HTMLFormElement | null,
  options: SerializeOptions = {},
): string {
  const { maxLength = MAX_SERIALIZED_LENGTH, includeNearbyContext = true } =
    options;

  if (!formElement) {
    // For standalone fields, serialize the main content area
    return serializePageContext(maxLength);
  }

  const parts: string[] = [];

  // Add nearby heading context
  if (includeNearbyContext) {
    const headingContext = extractNearbyHeadings(formElement);
    if (headingContext) {
      parts.push(`<!-- Context: ${headingContext} -->`);
    }
  }

  // Serialize the form
  const serialized = serializeElement(formElement, 0);
  parts.push(serialized);

  const result = parts.join("\n");
  return truncateToLength(result, maxLength);
}

/**
 * Serializes page context when no specific form element is available
 */
function serializePageContext(maxLength: number): string {
  const mainContent =
    document.querySelector("main") ||
    document.querySelector('[role="main"]') ||
    document.querySelector("article") ||
    document.body;

  if (!mainContent) {
    return "";
  }

  // Clone and clean the content
  const clone = mainContent.cloneNode(true) as HTMLElement;
  removeNoiseElements(clone);

  // Find all forms in the cleaned content
  const forms = clone.querySelectorAll("form");
  if (forms.length === 0) {
    // Look for standalone form fields
    const fields = clone.querySelectorAll("input, textarea, select");
    if (fields.length === 0) {
      return "";
    }

    // Serialize field containers
    const parts: string[] = [];
    const processedContainers = new Set<Element>();

    for (const field of Array.from(fields).slice(0, 20)) {
      const container = findFieldContainer(field);
      if (container && !processedContainers.has(container)) {
        processedContainers.add(container);
        parts.push(serializeElement(container, 0));
      }
    }

    return truncateToLength(parts.join("\n"), maxLength);
  }

  // Serialize all forms
  const serializedForms = Array.from(forms)
    .map((form) => serializeElement(form, 0))
    .join("\n\n");

  return truncateToLength(serializedForms, maxLength);
}

/**
 * Recursively serializes an element to minimal HTML
 */
function serializeElement(element: Element, depth: number): string {
  const tagName = element.tagName.toLowerCase();

  // Skip noise elements
  if (ELEMENTS_TO_STRIP.has(tagName)) {
    return "";
  }

  // Skip hidden elements
  if (element instanceof HTMLElement) {
    if (
      element.hidden ||
      element.style.display === "none" ||
      element.style.visibility === "hidden"
    ) {
      return "";
    }
  }

  const indent = "  ".repeat(depth);

  // For non-semantic elements, just process children
  if (!SEMANTIC_ELEMENTS.has(tagName)) {
    const childContent = serializeChildren(element, depth);
    return childContent;
  }

  // Build opening tag with relevant attributes
  const attrs = serializeAttributes(element);
  const attrStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";

  // Self-closing elements
  if (tagName === "input") {
    return `${indent}<${tagName}${attrStr} />`;
  }

  // Elements with text content
  if (tagName === "option" || tagName === "legend" || tagName === "label") {
    const text = getDirectTextContent(element);
    const children = serializeChildren(element, depth + 1);

    if (children) {
      return `${indent}<${tagName}${attrStr}>${text ? ` ${text}` : ""}\n${children}\n${indent}</${tagName}>`;
    }
    return `${indent}<${tagName}${attrStr}>${text}</${tagName}>`;
  }

  // Headings - include text content
  if (/^h[1-6]$/.test(tagName)) {
    const text = element.textContent?.trim().slice(0, 100) || "";
    return `${indent}<${tagName}>${text}</${tagName}>`;
  }

  // Container elements
  const children = serializeChildren(element, depth + 1);
  if (!children && tagName !== "textarea" && tagName !== "select") {
    return "";
  }

  if (tagName === "textarea") {
    const value = (element as HTMLTextAreaElement).value?.slice(0, 100) || "";
    return `${indent}<${tagName}${attrStr}>${value}</${tagName}>`;
  }

  return `${indent}<${tagName}${attrStr}>\n${children}\n${indent}</${tagName}>`;
}

/**
 * Serializes children of an element
 */
function serializeChildren(element: Element, depth: number): string {
  const parts: string[] = [];

  for (const child of Array.from(element.children)) {
    const serialized = serializeElement(child, depth);
    if (serialized) {
      parts.push(serialized);
    }
  }

  return parts.join("\n");
}

/**
 * Extracts relevant attributes from an element
 */
function serializeAttributes(element: Element): string[] {
  const attrs: string[] = [];

  for (const attr of Array.from(element.attributes)) {
    if (!RELEVANT_ATTRIBUTES.has(attr.name)) {
      continue;
    }

    // Skip cryptic attribute values
    if (attr.value && isCrypticValue(attr.value)) {
      continue;
    }

    // Truncate long values
    const value =
      attr.value.length > 50 ? `${attr.value.slice(0, 50)}...` : attr.value;

    if (attr.value === "") {
      attrs.push(attr.name);
    } else {
      attrs.push(`${attr.name}="${escapeAttr(value)}"`);
    }
  }

  return attrs;
}

/**
 * Gets direct text content of an element (not from children)
 */
function getDirectTextContent(element: Element): string {
  let text = "";

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    }
  }

  return text.trim().slice(0, 100);
}

/**
 * Finds the nearest container for a field (for standalone fields)
 */
function findFieldContainer(field: Element): Element | null {
  let current = field.parentElement;
  let depth = 0;

  while (current && depth < 5) {
    // Stop at common container patterns
    if (
      current.tagName.toLowerCase() === "div" ||
      current.tagName.toLowerCase() === "fieldset" ||
      current.classList.contains("form-group") ||
      current.classList.contains("field") ||
      current.classList.contains("input-group")
    ) {
      return current;
    }
    current = current.parentElement;
    depth++;
  }

  return field.parentElement;
}

/**
 * Extracts nearby heading text for context
 */
function extractNearbyHeadings(element: Element): string | null {
  const headings: string[] = [];

  // Look for headings above the form
  let sibling = element.previousElementSibling;
  let count = 0;

  while (sibling && count < 5) {
    if (/^h[1-6]$/i.test(sibling.tagName)) {
      const text = sibling.textContent?.trim();
      if (text) {
        headings.unshift(text.slice(0, 100));
      }
    }
    sibling = sibling.previousElementSibling;
    count++;
  }

  // Check parent for headings
  const parent = element.parentElement;
  if (parent) {
    const parentHeading = parent.querySelector("h1, h2, h3, h4, h5, h6");
    if (parentHeading && !element.contains(parentHeading)) {
      const text = parentHeading.textContent?.trim();
      if (text && !headings.includes(text)) {
        headings.unshift(text.slice(0, 100));
      }
    }
  }

  return headings.length > 0 ? headings.join(" > ") : null;
}

/**
 * Removes noise elements from a cloned DOM
 */
function removeNoiseElements(root: Element): void {
  for (const selector of NOISE_SELECTORS) {
    const elements = root.querySelectorAll(selector);
    for (const el of Array.from(elements)) {
      el.remove();
    }
  }

  for (const tagName of ELEMENTS_TO_STRIP) {
    const elements = root.querySelectorAll(tagName);
    for (const el of Array.from(elements)) {
      el.remove();
    }
  }
}

/**
 * Checks if a value looks like a cryptic/generated string
 */
function isCrypticValue(value: string): boolean {
  if (value.length < 12) return false;

  // UUID pattern
  if (
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  ) {
    return true;
  }

  // Long hex or base64
  if (/^[a-zA-Z0-9+/=]{32,}$/.test(value)) {
    return true;
  }

  // React/framework generated IDs
  if (/^[a-z]+_[a-f0-9]{8,}$/i.test(value)) {
    return true;
  }

  return false;
}

/**
 * Escapes HTML attribute value
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Truncates serialized output to max length
 */
function truncateToLength(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }

  // Try to truncate at a tag boundary
  const truncated = content.slice(0, maxLength);
  const lastTagEnd = truncated.lastIndexOf(">");

  if (lastTagEnd > maxLength * 0.8) {
    return `${truncated.slice(0, lastTagEnd + 1)}\n<!-- truncated -->`;
  }

  return `${truncated}\n<!-- truncated -->`;
}

/**
 * Extracts select options as an array of {value, label} objects
 */
export function extractSelectOptions(
  select: HTMLSelectElement,
): Array<{ value: string; label: string; selected: boolean }> {
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.text.trim(),
    selected: option.selected,
  }));
}

/**
 * Extracts radio group information
 */
export function extractRadioGroup(input: HTMLInputElement): {
  name: string;
  options: Array<{ value: string; label: string; checked: boolean }>;
} | null {
  if (input.type !== "radio" || !input.name) {
    return null;
  }

  const form = input.form || document;
  const radios = form.querySelectorAll<HTMLInputElement>(
    `input[type="radio"][name="${input.name}"]`,
  );

  const options = Array.from(radios).map((radio) => ({
    value: radio.value,
    label: findLabelForElement(radio) || radio.value,
    checked: radio.checked,
  }));

  return {
    name: input.name,
    options,
  };
}

/**
 * Finds the label text for a form element
 */
function findLabelForElement(element: HTMLElement): string | null {
  // Check for explicit label
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${element.id}"]`,
    );
    if (label) {
      return label.textContent?.trim() || null;
    }
  }

  // Check for wrapping label
  const parentLabel = element.closest("label");
  if (parentLabel) {
    // Get text content excluding the input itself
    const clone = parentLabel.cloneNode(true) as HTMLLabelElement;
    const inputs = clone.querySelectorAll("input, select, textarea");
    for (const input of Array.from(inputs)) {
      input.remove();
    }
    return clone.textContent?.trim() || null;
  }

  // Check aria-label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return ariaLabel;
  }

  return null;
}
