import { createLogger } from "@/lib/logger";
import type { CDPBoundingBox, CDPInteractiveElement } from "@/types/cdp";
import type { CDPConnection } from "./cdp-connection";

const logger = createLogger("cdp-dom-extractor");

/** Selectors for interactive elements we want to discover */
const INTERACTIVE_SELECTORS = [
  "input:not([type='hidden'])",
  "textarea",
  "select",
  "button",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='menuitem']",
  "[role='option']",
  "[role='switch']",
  "[role='tab']",
  "[role='textbox']",
  "[contenteditable='true']",
  "[contenteditable='']",
  "a[href]",
  "summary",
].join(", ");

/** Expression evaluated in page context to extract interactive elements */
const EXTRACTION_SCRIPT = `
(() => {
  const SELECTOR = ${JSON.stringify(INTERACTIVE_SELECTORS)};
  const elements = Array.from(document.querySelectorAll(SELECTOR));
  
  // Also find elements in shadow DOMs
  const findInShadows = (root) => {
    const shadowHosts = root.querySelectorAll('*');
    for (const host of shadowHosts) {
      if (host.shadowRoot) {
        const shadowElements = host.shadowRoot.querySelectorAll(SELECTOR);
        elements.push(...shadowElements);
        findInShadows(host.shadowRoot);
      }
    }
  };
  findInShadows(document);
  
  const results = [];
  let index = 0;
  
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    
    // Skip invisible elements
    if (
      rect.width === 0 && rect.height === 0 ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) === 0
    ) {
      continue;
    }
    
    // Skip elements fully outside viewport (with some margin)
    const pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (rect.bottom < -100 || rect.top > pageHeight + 100 || rect.right < -100 || rect.left > pageWidth + 100) {
      continue;
    }

    // Get label text
    let labelText = null;
    if (el.id) {
      const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (label) labelText = label.textContent?.trim() || null;
    }
    if (!labelText && el.closest('label')) {
      const labelEl = el.closest('label');
      // Get label text excluding the input element's own text
      const clone = labelEl.cloneNode(true);
      const inputs = clone.querySelectorAll('input, select, textarea, button');
      inputs.forEach(i => i.remove());
      labelText = clone.textContent?.trim() || null;
    }
    
    // Get options for select elements
    let options = undefined;
    if (el.tagName === 'SELECT') {
      options = Array.from(el.options).map(opt => ({
        value: opt.value,
        text: opt.textContent?.trim() || '',
        selected: opt.selected
      }));
    }
    
    // Build XPath
    const getXPath = (element) => {
      if (element.id) return '//*[@id="' + element.id + '"]';
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let idx = 0;
        let sibling = current.previousSibling;
        while (sibling) {
          if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) idx++;
          sibling = sibling.previousSibling;
        }
        const part = current.nodeName.toLowerCase() + (idx > 0 ? '[' + (idx + 1) + ']' : '');
        parts.unshift(part);
        current = current.parentNode;
      }
      return '/' + parts.join('/');
    };
    
    // Get visible text content
    let text = '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      text = el.value || '';
    } else if (el.tagName === 'SELECT') {
      const selected = el.options[el.selectedIndex];
      text = selected ? selected.textContent?.trim() || '' : '';
    } else {
      text = el.textContent?.trim()?.substring(0, 200) || '';
    }
    
    results.push({
      index: index,
      tagName: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      role: el.getAttribute('role'),
      text: text,
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
      label: labelText,
      name: el.getAttribute('name'),
      id: el.id || null,
      boundingBox: {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      },
      isVisible: rect.width > 0 && rect.height > 0,
      isEnabled: !el.disabled && !el.readOnly,
      isFocused: document.activeElement === el,
      currentValue: el.value || '',
      options: options,
      xpath: getXPath(el),
    });
    
    // Store index on element for annotation
    el.setAttribute('data-cdp-index', String(index));
    
    index++;
  }
  
  return JSON.stringify({
    elements: results,
    url: window.location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scrollPosition: { x: window.scrollX, y: window.scrollY },
    pageSize: {
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    }
  });
})()
`;

interface ExtractionResult {
  elements: Array<
    Omit<CDPInteractiveElement, "backendNodeId" | "objectId"> & {
      xpath: string;
    }
  >;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  scrollPosition: { x: number; y: number };
  pageSize: { width: number; height: number };
}

/**
 * Extracts interactive elements from the page using CDP Runtime.evaluate.
 * Returns structured data about each element including bounding boxes.
 */
export async function extractInteractiveElements(
  connection: CDPConnection,
): Promise<{
  elements: CDPInteractiveElement[];
  url: string;
  title: string;
  viewport: { width: number; height: number };
  scrollPosition: { x: number; y: number };
  pageSize: { width: number; height: number };
}> {
  const evalResult = await connection.send<{
    result: { type: string; value?: string };
    exceptionDetails?: { text: string };
  }>("Runtime.evaluate", {
    expression: EXTRACTION_SCRIPT,
    returnByValue: true,
    awaitPromise: false,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(
      `DOM extraction failed: ${evalResult.exceptionDetails.text}`,
    );
  }

  if (!evalResult.result.value) {
    throw new Error("DOM extraction returned no data");
  }

  const data: ExtractionResult = JSON.parse(evalResult.result.value);

  logger.info(
    `Extracted ${data.elements.length} interactive elements from ${data.url}`,
  );

  // Resolve backend node IDs for each element via CDP DOM queries
  const elements: CDPInteractiveElement[] = [];

  for (const el of data.elements) {
    try {
      const nodeResult = await resolveBackendNodeId(connection, el.xpath);
      elements.push({
        ...el,
        backendNodeId: nodeResult.backendNodeId,
        objectId: nodeResult.objectId,
      });
    } catch {
      // If we can't resolve the node, still include it without backend IDs
      elements.push({
        ...el,
        backendNodeId: 0,
        objectId: undefined,
      });
    }
  }

  return {
    elements,
    url: data.url,
    title: data.title,
    viewport: data.viewport,
    scrollPosition: data.scrollPosition,
    pageSize: data.pageSize,
  };
}

/**
 * Resolves a backend node ID for an element via its XPath.
 */
async function resolveBackendNodeId(
  connection: CDPConnection,
  xpath: string,
): Promise<{ backendNodeId: number; objectId?: string }> {
  // Use Runtime.evaluate to find the element and get its object reference
  const result = await connection.send<{
    result: { objectId?: string; type: string };
    exceptionDetails?: { text: string };
  }>("Runtime.evaluate", {
    expression: `document.evaluate(${JSON.stringify(xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`,
    returnByValue: false,
  });

  if (!result.result.objectId) {
    throw new Error(`Could not find element at xpath: ${xpath}`);
  }

  // Get the DOM node details including backendNodeId
  const nodeResult = await connection.send<{
    node: { backendNodeId: number };
  }>("DOM.describeNode", {
    objectId: result.result.objectId,
  });

  return {
    backendNodeId: nodeResult.node.backendNodeId,
    objectId: result.result.objectId,
  };
}

/**
 * Gets the bounding box of an element using its backend node ID.
 * Used for clicking at the right coordinates.
 */
export async function getElementBoundingBox(
  connection: CDPConnection,
  backendNodeId: number,
): Promise<CDPBoundingBox | null> {
  try {
    const result = await connection.send<{
      model: {
        content: number[];
        border: number[];
      };
    }>("DOM.getBoxModel", {
      backendNodeId,
    });

    if (!result.model) return null;

    // content quad: [x1,y1, x2,y2, x3,y3, x4,y4]
    const content = result.model.content;
    const x = Math.min(content[0], content[6]);
    const y = Math.min(content[1], content[3]);
    const width = Math.max(content[2], content[4]) - x;
    const height = Math.max(content[5], content[7]) - y;

    return { x, y, width, height };
  } catch {
    return null;
  }
}

/**
 * Scrolls the element into view using CDP DOM.scrollIntoViewIfNeeded.
 */
export async function scrollElementIntoView(
  connection: CDPConnection,
  backendNodeId: number,
): Promise<void> {
  try {
    await connection.send("DOM.scrollIntoViewIfNeeded", {
      backendNodeId,
    });
  } catch (error) {
    logger.warn("Failed to scroll element into view:", error);
  }
}
