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
  await focusNode(tabId, backendNodeId);
  await selectAll(tabId);
  await dispatchKey(tabId, "Backspace", "Backspace");

  for (const char of value) {
    await dispatchKey(tabId, char, char, "keyDown");
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      text: char,
    });
    await dispatchKey(tabId, char, char, "keyUp");
    await delay(
      TYPING_DELAY_MIN + Math.random() * (TYPING_DELAY_MAX - TYPING_DELAY_MIN),
    );
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

  await clickCenter(tabId, field.rect);
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

  // Find matching radio by value or label (case-insensitive)
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

  await clickCenter(tabId, target.rect);
}

async function fillSelectLike(
  tabId: number,
  field: CDPDetectedField,
  value: string,
): Promise<void> {
  // Try native <select> approach first via Runtime.callFunctionOn
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId: field.backendNodeId },
    );

    if (resolved?.object?.objectId) {
      const result = await sendCommand<{
        result: { type: string; value: boolean };
      }>(tabId, "Runtime.callFunctionOn", {
        objectId: resolved.object.objectId,
        functionDeclaration: `function(targetValue) {
          const el = this;
          if (el.tagName === 'SELECT') {
            const option = Array.from(el.options).find(
              o => o.value === targetValue || o.textContent.trim().toLowerCase() === targetValue.toLowerCase()
            );
            if (option) {
              el.value = option.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
          }
          return false;
        }`,
        arguments: [{ value }],
        returnByValue: true,
      });

      if (result?.result?.value === true) return;
    }
  } catch {
    // Fall through to click-based approach
  }

  // Click-based fallback for custom combobox/listbox
  await clickCenter(tabId, field.rect);
  await delay(300);

  // Type value to filter/search in combo
  for (const char of value) {
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      text: char,
    });
    await delay(50);
  }
  await delay(200);

  // Press Enter to confirm
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
          )?.set;
          if (nativeSetter) nativeSetter.call(this, v);
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
    modifiers: 2, // Ctrl/Cmd
  });
  await sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    modifiers: 2,
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
    text: type === "keyDown" ? key : undefined,
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
