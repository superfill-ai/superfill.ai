/**
 * Selector Generator - Creates unique CSS selectors for form elements
 *
 * Used to identify and re-query form fields instead of storing element references.
 * Supports persistence across page refreshes and dynamic DOM changes.
 */

import type { FormFieldElement } from "@/types/autofill";

/**
 * Check if a string looks like a framework-generated cryptic ID
 * (e.g., React's ":r0:", Angular's "mat-input-0", random hashes)
 */
function isCrypticId(id: string): boolean {
  if (!id || id.length < 2) return true;

  // React-style IDs
  if (id.startsWith(":") && id.endsWith(":")) return true;

  // Very short or numeric IDs
  if (/^\d+$/.test(id)) return true;

  // Hash-like IDs (all lowercase alphanumeric, 8+ chars)
  if (/^[a-z0-9]{8,}$/.test(id) && !/[aeiou]{2,}/i.test(id)) return true;

  // Framework prefixes with numbers
  if (/^(mat-|ng-|react-|_|ember)\w*\d+/.test(id)) return true;

  return false;
}

/**
 * Escape special characters for use in CSS selectors
 */
function cssEscape(str: string): string {
  return CSS.escape(str);
}

/**
 * Get the form context selector if the element is inside a form
 */
function getFormContext(element: FormFieldElement): string {
  const form = element.form;
  if (!form) return "";

  // Try form id first
  if (form.id && !isCrypticId(form.id)) {
    return `#${cssEscape(form.id)} `;
  }

  // Try form name
  if (form.name) {
    return `form[name="${cssEscape(form.name)}"] `;
  }

  // Try form action (last resort for form context)
  if (form.action) {
    const actionPath = new URL(form.action, window.location.origin).pathname;
    return `form[action="${cssEscape(actionPath)}"] `;
  }

  return "";
}

/**
 * Generate nth-of-type selector as fallback
 * Includes form context and increases depth until unique
 */
function getNthSelector(element: FormFieldElement): string {
  const tagName = element.tagName.toLowerCase();
  const parent = element.parentElement;
  const formContext = getFormContext(element);

  if (!parent) {
    return `${formContext}${tagName}`;
  }

  // Find index among siblings of same type
  const siblings = Array.from(parent.children).filter(
    (el) => el.tagName.toLowerCase() === tagName,
  );
  const index = siblings.indexOf(element) + 1;

  // Try increasing depth until we get a unique selector
  for (let depth = 2; depth <= 5; depth++) {
    const parentSelector = getParentChain(parent, depth);
    const selector = `${formContext}${parentSelector} > ${tagName}:nth-of-type(${index})`;

    if (isUnique(selector)) {
      return selector;
    }
  }

  // If still not unique, add data attributes or aria attributes for disambiguation
  const dataAttrs = Array.from(element.attributes)
    .filter(
      (attr) => attr.name.startsWith("data-") || attr.name.startsWith("aria-"),
    )
    .slice(0, 2);

  if (dataAttrs.length > 0) {
    const attrSelector = dataAttrs
      .map((attr) => `[${attr.name}="${cssEscape(attr.value)}"]`)
      .join("");
    const selector = `${formContext}${tagName}${attrSelector}`;
    if (isUnique(selector)) return selector;
  }

  // Last resort: use full parent chain
  const parentSelector = getParentChain(parent, 4);
  return `${formContext}${parentSelector} > ${tagName}:nth-of-type(${index})`;
}

/**
 * Build a parent chain selector for context
 */
function getParentChain(element: Element | null, depth: number): string {
  if (!element || depth <= 0 || element === document.body) {
    return "";
  }

  const tagName = element.tagName.toLowerCase();
  let selector = tagName;

  // Add id if available and not cryptic
  if (element.id && !isCrypticId(element.id)) {
    return `#${cssEscape(element.id)}`;
  }

  // Add meaningful class if available
  const meaningfulClass = Array.from(element.classList).find(
    (cls) =>
      !isCrypticId(cls) &&
      cls.length > 2 &&
      !cls.startsWith("_") &&
      !/^[a-z]{1,2}\d+/.test(cls),
  );
  if (meaningfulClass) {
    selector += `.${cssEscape(meaningfulClass)}`;
  }

  const parentChain = getParentChain(element.parentElement, depth - 1);
  return parentChain ? `${parentChain} > ${selector}` : selector;
}

/**
 * Generate a unique CSS selector for a form field element
 *
 * Priority:
 * 1. #id (if stable)
 * 2. [name="..."][type="..."] with form context
 * 3. [name="..."][value="..."] for radio buttons
 * 4. nth-of-type fallback
 */
export function generateSelector(element: FormFieldElement): string {
  const formContext = getFormContext(element);

  // 1. Try stable ID
  if (element.id && !isCrypticId(element.id)) {
    const selector = `#${cssEscape(element.id)}`;
    if (isUnique(selector)) return selector;
  }

  // 2. For radio buttons, use name + value
  if (
    element instanceof HTMLInputElement &&
    element.type === "radio" &&
    element.name
  ) {
    const selector = `${formContext}input[type="radio"][name="${cssEscape(element.name)}"][value="${cssEscape(element.value)}"]`;
    if (isUnique(selector)) return selector;
  }

  // 3. For checkboxes with value, use name + value
  if (
    element instanceof HTMLInputElement &&
    element.type === "checkbox" &&
    element.name &&
    element.value &&
    element.value !== "on"
  ) {
    const selector = `${formContext}input[type="checkbox"][name="${cssEscape(element.name)}"][value="${cssEscape(element.value)}"]`;
    if (isUnique(selector)) return selector;
  }

  // 4. Try name + type combination
  if (element.name) {
    const type =
      element instanceof HTMLInputElement
        ? element.type
        : element.tagName.toLowerCase();
    const selector = `${formContext}[name="${cssEscape(element.name)}"][type="${type}"]`;
    if (isUnique(selector)) return selector;

    // Try just name with form context
    const nameSelector = `${formContext}[name="${cssEscape(element.name)}"]`;
    if (isUnique(nameSelector)) return nameSelector;
  }

  // 5. Try placeholder for inputs without name
  if (
    element instanceof HTMLInputElement &&
    element.placeholder &&
    element.placeholder.length > 2
  ) {
    const type = element.type || "text";
    const selector = `${formContext}input[type="${type}"][placeholder="${cssEscape(element.placeholder)}"]`;
    if (isUnique(selector)) return selector;
  }

  // 6. For selects, try by first option or aria-label
  if (element instanceof HTMLSelectElement) {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      const selector = `${formContext}select[aria-label="${cssEscape(ariaLabel)}"]`;
      if (isUnique(selector)) return selector;
    }
  }

  // 7. Fallback to nth-of-type
  return getNthSelector(element);
}

/**
 * Check if a selector uniquely identifies one element
 */
function isUnique(selector: string): boolean {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1;
  } catch {
    return false;
  }
}

/**
 * Query an element by its selector
 * Returns null if not found or multiple matches
 */
export function queryBySelector(selector: string): FormFieldElement | null {
  try {
    const element = document.querySelector(selector);
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      return element;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate XPath for an element (fallback for shadow DOM or complex cases)
 */
export function generateXPath(element: FormFieldElement): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    // Add id if available
    if (current.id && !isCrypticId(current.id)) {
      return `//*[@id="${current.id}"]${parts.length > 0 ? `/${parts.reverse().join("/")}` : ""}`;
    }

    // Add index among siblings
    const parent: Element | null = current.parentElement;
    const currentTagName = current.tagName;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (el): el is Element => el.tagName === currentTagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `[${index}]`;
      }
    }

    parts.push(selector);
    current = parent;
  }

  return `//${parts.reverse().join("/")}`;
}

/**
 * Query element by XPath
 */
export function queryByXPath(xpath: string): FormFieldElement | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    const element = result.singleNodeValue;
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      return element;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Combined selector data for maximum flexibility
 */
export interface FieldSelector {
  css: string;
  xpath?: string;
}

/**
 * Generate both CSS and XPath selectors for a field
 */
export function generateFieldSelector(
  element: FormFieldElement,
): FieldSelector {
  const css = generateSelector(element);

  // Only generate XPath if CSS selector uses nth-of-type (less stable)
  const needsXPath = css.includes(":nth-of-type");

  return {
    css,
    xpath: needsXPath ? generateXPath(element) : undefined,
  };
}

/**
 * Query element using selector data (tries CSS first, then XPath)
 */
export function queryField(selector: FieldSelector): FormFieldElement | null {
  // Try CSS first
  const cssResult = queryBySelector(selector.css);
  if (cssResult) return cssResult;

  // Fall back to XPath if available
  if (selector.xpath) {
    return queryByXPath(selector.xpath);
  }

  return null;
}
