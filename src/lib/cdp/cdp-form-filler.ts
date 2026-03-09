import { delay } from "@/lib/delay";
import { createLogger } from "@/lib/logger";
import type {
  CDPDetectedField,
  CDPFieldMapping,
  CDPRect,
} from "@/types/autofill";
import { sendCommand } from "./cdp-service";

const logger = createLogger("cdp-form-filler");

const TYPING_DELAY_MIN = 30;
const TYPING_DELAY_MAX = 80;
const BETWEEN_FIELDS_DELAY = 150;

export async function fillAllFields(
  tabId: number,
  mappings: CDPFieldMapping[],
): Promise<void> {
  logger.info(`Filling ${mappings.length} fields via CDP`);

  for (const mapping of mappings) {
    try {
      await fillField(tabId, mapping.field, mapping.value);
      await delay(BETWEEN_FIELDS_DELAY);
    } catch (error) {
      logger.error(
        `Failed to fill field ${mapping.field.opid} (${mapping.field.role}):`,
        error,
      );
    }
  }

  logger.info("CDP fill complete");
}

async function fillField(
  tabId: number,
  field: CDPDetectedField,
  value: string,
): Promise<void> {
  const { role } = field;

  if (field.domMetadata?.isContentEditable) {
    await fillContentEditable(tabId, field.backendNodeId, value);
    return;
  }

  switch (role) {
    case "textbox":
    case "searchbox":
    case "textarea":
    case "spinbutton":
      await fillTextField(tabId, field.backendNodeId, value);
      break;

    case "checkbox":
    case "switch":
    case "menuitemcheckbox":
      await fillCheckbox(tabId, field, value);
      break;

    case "radiogroup":
      await fillRadioGroup(tabId, field, value);
      break;

    case "combobox":
    case "listbox":
      await fillSelectLike(tabId, field, value);
      break;

    case "slider":
      await fillSlider(tabId, field, value);
      break;

    default:
      logger.warn(`Unsupported role for filling: ${role}`);
  }
}

async function fillTextField(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<void> {
  const wasSetViaRuntime = await setNodeValueViaRuntime(
    tabId,
    backendNodeId,
    value,
  );

  if (wasSetViaRuntime) {
    return;
  }

  await focusNode(tabId, backendNodeId);
  await selectAll(tabId);
  await dispatchKey(tabId, "Backspace", "Backspace");

  for (const char of value) {
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      text: char,
    });
    await delay(
      TYPING_DELAY_MIN + Math.random() * (TYPING_DELAY_MAX - TYPING_DELAY_MIN),
    );
  }
}

async function setNodeValueViaRuntime(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<boolean> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );

    if (!resolved?.object?.objectId) {
      return false;
    }

    const result = await sendCommand<{ result: { value?: boolean } }>(
      tabId,
      "Runtime.callFunctionOn",
      {
        objectId: resolved.object.objectId,
        functionDeclaration: `function(nextValue) {
          const el = this;
          if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
            return false;
          }

          const prototype = el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;

          const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value');
          if (nativeSetter?.set) {
            nativeSetter.set.call(el, nextValue);
          } else {
            el.value = nextValue;
          }

          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }`,
        arguments: [{ value }],
        returnByValue: true,
      },
    );

    return result?.result?.value === true;
  } catch {
    return false;
  }
}

async function fillContentEditable(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<void> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );

    if (!resolved?.object?.objectId) return;

    await sendCommand(tabId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function(nextValue) {
        this.focus();
        this.textContent = nextValue;
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
      }`,
      arguments: [{ value }],
    });
  } catch (error) {
    logger.error(`Failed to fill contenteditable ${backendNodeId}:`, error);
  }
}

async function fillCheckbox(
  tabId: number,
  field: CDPDetectedField,
  value: string,
): Promise<void> {
  const shouldBeChecked = value === "true" || value === "yes" || value === "1";
  const isChecked = field.checked === true;

  if (shouldBeChecked === isChecked) {
    logger.debug(`Checkbox ${field.opid} already in desired state`);
    return;
  }

  await clickNodeDirect(tabId, field.backendNodeId);
}

async function fillRadioGroup(
  tabId: number,
  field: CDPDetectedField,
  value: string,
): Promise<void> {
  if (!field.radioOptions?.length) {
    logger.warn(`Radio group ${field.opid} has no options`);
    return;
  }

  const valueLower = value.toLowerCase();
  const target = field.radioOptions.find(
    (opt) =>
      opt.value.toLowerCase() === valueLower ||
      opt.label.toLowerCase() === valueLower,
  );

  if (!target) {
    logger.warn(
      `No matching radio option for value "${value}" in group ${field.opid}`,
    );
    return;
  }

  if (target.checked) {
    logger.debug(`Radio option "${value}" already selected`);
    return;
  }

  await clickNodeDirect(tabId, target.backendNodeId);
}

async function clickNodeDirect(
  tabId: number,
  backendNodeId: number,
): Promise<void> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );

    if (!resolved?.object?.objectId) {
      logger.warn(`Could not resolve node ${backendNodeId} for direct click`);
      return;
    }

    await sendCommand(tabId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function() {
        this.scrollIntoView({ block: 'center', behavior: 'instant' });
        this.focus();
        this.click();
        this.dispatchEvent(new Event('change', { bubbles: true }));
      }`,
    });
  } catch (error) {
    logger.error(`Direct click failed for node ${backendNodeId}:`, error);
  }
}

async function fillSelectLike(
  tabId: number,
  field: CDPDetectedField,
  value: string,
): Promise<void> {
  if (await tryNativeSelect(tabId, field.backendNodeId, value)) return;

  if (await tryAriaControlledOption(tabId, field.backendNodeId, value)) return;

  await fillCustomCombobox(tabId, field, value);
}

async function tryNativeSelect(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<boolean> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );

    if (!resolved?.object?.objectId) return false;

    const result = await sendCommand<{
      result: { type: string; value: boolean };
    }>(tabId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function(targetValue) {
        const el = this;
        if (el.tagName !== 'SELECT') return false;
        const tl = targetValue.toLowerCase();
        const option = Array.from(el.options).find(o =>
          o.value === targetValue
          || o.value.toLowerCase() === tl
          || o.textContent.trim().toLowerCase() === tl
        );
        if (!option) return false;
        el.value = option.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }`,
      arguments: [{ value }],
      returnByValue: true,
    });

    return result?.result?.value === true;
  } catch {
    return false;
  }
}

async function tryAriaControlledOption(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<boolean> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );

    if (!resolved?.object?.objectId) return false;

    const result = await sendCommand<{
      result: { type: string; value: string };
    }>(tabId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function(targetValue) {
        const el = this;
        const listboxId = el.getAttribute('aria-owns') || el.getAttribute('aria-controls');
        if (!listboxId) return JSON.stringify({ found: false });
        const tl = targetValue.toLowerCase();
        for (const id of listboxId.split(/\\s+/)) {
          const listbox = document.getElementById(id);
          if (!listbox) continue;
          const opts = listbox.querySelectorAll('[role="option"], li[data-value], li');
          for (const opt of opts) {
            const optValue = opt.getAttribute('data-value') || opt.getAttribute('value') || opt.textContent.trim();
            if (optValue.toLowerCase() === tl || opt.textContent.trim().toLowerCase() === tl) {
              const rect = opt.getBoundingClientRect();
              return JSON.stringify({ found: true, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
            }
          }
        }
        return JSON.stringify({ found: false });
      }`,
      arguments: [{ value }],
      returnByValue: true,
    });

    if (!result?.result?.value) return false;
    const parsed = JSON.parse(result.result.value);
    if (!parsed.found) return false;

    await clickCenter(tabId, parsed as CDPRect);
    return true;
  } catch {
    return false;
  }
}

async function fillCustomCombobox(
  tabId: number,
  field: CDPDetectedField,
  value: string,
): Promise<void> {
  await clickCenter(tabId, field.rect);
  await delay(300);

  await focusNode(tabId, field.backendNodeId);

  await selectAll(tabId);
  await dispatchKey(tabId, "Backspace", "Backspace");
  await delay(50);

  for (const char of value) {
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      text: char,
    });
    await delay(50);
  }
  await delay(400);

  await dispatchKey(tabId, "Enter", "Enter");
}

async function fillSlider(
  tabId: number,
  field: CDPDetectedField,
  value: string,
): Promise<void> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId: field.backendNodeId },
    );

    if (resolved?.object?.objectId) {
      await sendCommand(tabId, "Runtime.callFunctionOn", {
        objectId: resolved.object.objectId,
        functionDeclaration: `function(v) {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'value'
          );
          if (nativeSetter?.set) nativeSetter.set.call(this, v);
          else this.value = v;
          this.dispatchEvent(new Event('input', { bubbles: true }));
          this.dispatchEvent(new Event('change', { bubbles: true }));
        }`,
        arguments: [{ value }],
      });
    }
  } catch (error) {
    logger.error(`Failed to fill slider ${field.opid}:`, error);
  }
}

async function focusNode(tabId: number, backendNodeId: number): Promise<void> {
  await sendCommand(tabId, "DOM.focus", { backendNodeId });
}

async function selectAll(tabId: number): Promise<void> {
  await sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    modifiers: 4,
  });
  await sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    modifiers: 4,
  });
}

async function dispatchKey(
  tabId: number,
  key: string,
  code: string,
  type: "keyDown" | "keyUp" = "keyDown",
): Promise<void> {
  await sendCommand(tabId, "Input.dispatchKeyEvent", {
    type,
    key,
    code,
  });

  if (type === "keyDown") {
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
    });
  }
}

async function clickCenter(tabId: number, rect: CDPRect): Promise<void> {
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;

  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });

  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}
