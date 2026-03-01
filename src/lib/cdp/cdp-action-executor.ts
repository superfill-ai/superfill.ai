import { createLogger } from "@/lib/logger";
import { delay } from "@/lib/delay";
import type {
  CDPActionResult,
  CDPAgentAction,
  CDPInteractiveElement,
} from "@/types/cdp";
import type { CDPConnection } from "./cdp-connection";
import {
  getElementBoundingBox,
  scrollElementIntoView,
} from "./cdp-dom-extractor";

const logger = createLogger("cdp-action-executor");

/**
 * Executes a single CDP agent action on the page.
 * Dispatches to the appropriate handler based on action type.
 */
export async function executeAction(
  connection: CDPConnection,
  action: CDPAgentAction,
  elements: CDPInteractiveElement[],
): Promise<CDPActionResult> {
  try {
    switch (action.action) {
      case "click":
        return await executeClick(connection, action.index, elements, action.doubleClick);
      case "type":
        return await executeType(
          connection,
          action.index,
          action.text,
          elements,
          action.clearFirst ?? true,
        );
      case "select_option":
        return await executeSelectOption(
          connection,
          action.index,
          action.value,
          elements,
        );
      case "scroll":
        return await executeScroll(
          connection,
          action.direction,
          action.amount ?? 500,
        );
      case "key_press":
        return await executeKeyPress(connection, action.key);
      case "wait":
        return await executeWait(Math.min(action.duration, 3000));
      case "done":
        return { success: true, description: `Agent finished: ${action.summary}` };
      case "go_back":
        return await executeGoBack(connection);
      case "tab":
        return await executeTab(connection, action.count ?? 1, action.shift ?? false);
      default:
        return { success: false, description: "Unknown action", error: `Unknown action type` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Action execution failed:`, action, error);
    return { success: false, description: "Action failed", error: message };
  }
}

/**
 * Click on an element by its index.
 */
async function executeClick(
  connection: CDPConnection,
  index: number,
  elements: CDPInteractiveElement[],
  doubleClick?: boolean,
): Promise<CDPActionResult> {
  const element = elements[index];
  if (!element) {
    return {
      success: false,
      description: `Element at index ${index} not found`,
      error: "Element not found",
    };
  }

  // Scroll element into view first
  if (element.backendNodeId) {
    await scrollElementIntoView(connection, element.backendNodeId);
    await delay(100);
  }

  // Get fresh bounding box after scroll
  let box = element.boundingBox;
  if (element.backendNodeId) {
    const freshBox = await getElementBoundingBox(connection, element.backendNodeId);
    if (freshBox) box = freshBox;
  }

  // Click at center of element
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Convert page coordinates to viewport coordinates
  const scrollPos = await getScrollPosition(connection);
  const viewportX = x - scrollPos.x;
  const viewportY = y - scrollPos.y;

  const clickCount = doubleClick ? 2 : 1;

  // Mouse down
  await connection.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: viewportX,
    y: viewportY,
    button: "left",
    clickCount,
  });

  // Mouse up
  await connection.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: viewportX,
    y: viewportY,
    button: "left",
    clickCount,
  });

  const desc = `Clicked ${element.tagName}${element.label ? ` "${element.label}"` : ""}${element.text ? ` "${element.text.substring(0, 50)}"` : ""} at [${index}]`;
  logger.info(desc);

  return { success: true, description: desc };
}

/**
 * Type text into an element.
 */
async function executeType(
  connection: CDPConnection,
  index: number,
  text: string,
  elements: CDPInteractiveElement[],
  clearFirst: boolean,
): Promise<CDPActionResult> {
  const element = elements[index];
  if (!element) {
    return {
      success: false,
      description: `Element at index ${index} not found`,
      error: "Element not found",
    };
  }

  // Click the element first to focus it
  const clickResult = await executeClick(connection, index, elements);
  if (!clickResult.success) return clickResult;

  await delay(100);

  // Clear existing text if requested
  if (clearFirst) {
    // Select all text
    await connection.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      modifiers: isMac() ? 4 : 2, // Meta on Mac, Ctrl on others
    });
    await connection.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      modifiers: isMac() ? 4 : 2,
    });

    // Delete selected text
    await connection.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Backspace",
      code: "Backspace",
    });
    await connection.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Backspace",
      code: "Backspace",
    });

    await delay(50);
  }

  // Type each character with Input.dispatchKeyEvent for realistic key events
  for (const char of text) {
    await connection.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: char,
      text: char,
    });
    await connection.send("Input.dispatchKeyEvent", {
      type: "char",
      key: char,
      text: char,
    });
    await connection.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: char,
      text: char,
    });

    // Small random delay between keystrokes for realism
    await delay(Math.random() * 30 + 15);
  }

  const desc = `Typed "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}" into ${element.tagName}${element.label ? ` "${element.label}"` : ""} at [${index}]`;
  logger.info(desc);

  return { success: true, description: desc };
}

/**
 * Select an option in a select element.
 */
async function executeSelectOption(
  connection: CDPConnection,
  index: number,
  value: string,
  elements: CDPInteractiveElement[],
): Promise<CDPActionResult> {
  const element = elements[index];
  if (!element) {
    return {
      success: false,
      description: `Element at index ${index} not found`,
      error: "Element not found",
    };
  }

  // Use Runtime.evaluate to set the select value directly
  const selectScript = `
    (() => {
      const el = document.querySelector('[data-cdp-index="${index}"]') || 
                 document.evaluate(${JSON.stringify(element.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!el || el.tagName !== 'SELECT') return JSON.stringify({ success: false, error: 'Element not found or not a select' });
      
      const targetValue = ${JSON.stringify(value)};
      let found = false;
      
      for (const option of el.options) {
        if (option.value === targetValue || option.textContent?.trim() === targetValue) {
          option.selected = true;
          found = true;
          break;
        }
      }
      
      if (!found) return JSON.stringify({ success: false, error: 'Option not found: ' + targetValue });
      
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      
      return JSON.stringify({ success: true, selectedValue: el.value });
    })()
  `;

  const result = await connection.send<{
    result: { value?: string };
    exceptionDetails?: { text: string };
  }>("Runtime.evaluate", {
    expression: selectScript,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    return {
      success: false,
      description: "Failed to select option",
      error: result.exceptionDetails.text,
    };
  }

  const parsed = JSON.parse(result.result.value || "{}");
  if (!parsed.success) {
    return {
      success: false,
      description: `Failed to select "${value}"`,
      error: parsed.error,
    };
  }

  const desc = `Selected "${value}" in ${element.tagName}${element.label ? ` "${element.label}"` : ""} at [${index}]`;
  logger.info(desc);

  return { success: true, description: desc };
}

/**
 * Scroll the page in a direction.
 */
async function executeScroll(
  connection: CDPConnection,
  direction: "up" | "down",
  amount: number,
): Promise<CDPActionResult> {
  const deltaY = direction === "down" ? amount : -amount;

  await connection.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 640,
    y: 450,
    deltaX: 0,
    deltaY,
  });

  await delay(300);

  const desc = `Scrolled ${direction} by ${amount}px`;
  logger.info(desc);

  return { success: true, description: desc };
}

/**
 * Press a keyboard key.
 */
async function executeKeyPress(
  connection: CDPConnection,
  key: string,
): Promise<CDPActionResult> {
  const keyMapping = getKeyMapping(key);

  await connection.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: keyMapping.key,
    code: keyMapping.code,
    ...(keyMapping.keyCode ? { windowsVirtualKeyCode: keyMapping.keyCode } : {}),
  });

  await connection.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: keyMapping.key,
    code: keyMapping.code,
    ...(keyMapping.keyCode ? { windowsVirtualKeyCode: keyMapping.keyCode } : {}),
  });

  const desc = `Pressed key: ${key}`;
  logger.info(desc);

  return { success: true, description: desc };
}

/**
 * Wait for a specified duration.
 */
async function executeWait(duration: number): Promise<CDPActionResult> {
  await delay(duration);

  return { success: true, description: `Waited ${duration}ms` };
}

/**
 * Navigate back in browser history.
 */
async function executeGoBack(
  connection: CDPConnection,
): Promise<CDPActionResult> {
  const history = await connection.send<{
    currentIndex: number;
    entries: Array<{ url: string }>;
  }>("Page.getNavigationHistory");

  if (history.currentIndex <= 0) {
    return {
      success: false,
      description: "Cannot go back - already at first page",
      error: "No history to go back to",
    };
  }

  const previousEntry = history.entries[history.currentIndex - 1];
  await connection.send("Page.navigateToHistoryEntry", {
    entryId: history.currentIndex - 1,
  });

  await delay(1000);

  return {
    success: true,
    description: `Navigated back to ${previousEntry.url}`,
    didNavigate: true,
  };
}

/**
 * Press Tab key N times.
 */
async function executeTab(
  connection: CDPConnection,
  count: number,
  shift: boolean,
): Promise<CDPActionResult> {
  for (let i = 0; i < count; i++) {
    const modifiers = shift ? 8 : 0; // 8 = Shift

    await connection.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      modifiers,
    });
    await connection.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      modifiers,
    });

    await delay(50);
  }

  const desc = `Pressed ${shift ? "Shift+" : ""}Tab ${count} time(s)`;
  logger.info(desc);

  return { success: true, description: desc };
}

// Helpers

async function getScrollPosition(
  connection: CDPConnection,
): Promise<{ x: number; y: number }> {
  const result = await connection.send<{
    result: { value?: string };
  }>("Runtime.evaluate", {
    expression: `JSON.stringify({ x: window.scrollX, y: window.scrollY })`,
    returnByValue: true,
  });

  return result.result.value
    ? JSON.parse(result.result.value)
    : { x: 0, y: 0 };
}

function isMac(): boolean {
  // In extension background context, navigator is available
  return typeof navigator !== "undefined" &&
    navigator.platform?.toLowerCase().includes("mac");
}

function getKeyMapping(key: string): {
  key: string;
  code: string;
  keyCode?: number;
} {
  const mappings: Record<
    string,
    { key: string; code: string; keyCode?: number }
  > = {
    Enter: { key: "Enter", code: "Enter", keyCode: 13 },
    Tab: { key: "Tab", code: "Tab", keyCode: 9 },
    Escape: { key: "Escape", code: "Escape", keyCode: 27 },
    Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    Delete: { key: "Delete", code: "Delete", keyCode: 46 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    Space: { key: " ", code: "Space", keyCode: 32 },
    Home: { key: "Home", code: "Home", keyCode: 36 },
    End: { key: "End", code: "End", keyCode: 35 },
    PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
    PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
  };

  return mappings[key] || { key, code: `Key${key.toUpperCase()}` };
}
