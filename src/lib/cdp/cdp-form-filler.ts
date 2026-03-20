import { delay } from "@/lib/delay";
import { createLogger } from "@/lib/logger";
import type {
  CDPDetectedField,
  CDPFieldMapping,
  CDPFillOutcome,
  CDPFillSummary,
} from "@/types/autofill";
import { resolveFieldBackendNodeId } from "./cdp-field-fingerprint";
import {
  parseBooleanLike,
  readCheckedState,
  verifyFilledField,
} from "./cdp-fill-verifier";
import { sendCommand } from "./cdp-service";

const logger = createLogger("cdp-form-filler");

const TYPING_DELAY_MIN = 30;
const TYPING_DELAY_MAX = 80;
const BETWEEN_FIELDS_DELAY = 150;
const MAX_FILL_ATTEMPTS = 2;

export async function fillAllFields(
  tabId: number,
  mappings: CDPFieldMapping[],
): Promise<CDPFillSummary> {
  logger.info(`Filling ${mappings.length} fields via CDP`);

  const outcomes: CDPFillOutcome[] = [];
  let previousDomToken = await getDOMVersionToken(tabId);

  for (const mapping of mappings) {
    const domTokenBeforeFill = await getDOMVersionToken(tabId);
    const domDrifted =
      previousDomToken !== null &&
      domTokenBeforeFill !== null &&
      previousDomToken !== domTokenBeforeFill;
    const outcome = await fillFieldWithRecoveryAndVerification(
      tabId,
      mapping,
      domDrifted,
    );
    outcomes.push(outcome);
    previousDomToken = domTokenBeforeFill ?? previousDomToken;
    await delay(BETWEEN_FIELDS_DELAY);
  }

  const summary: CDPFillSummary = {
    total: outcomes.length,
    succeeded: outcomes.filter((o) => o.status !== "failed").length,
    verified: outcomes.filter((o) => o.verified).length,
    recovered: outcomes.filter((o) => o.status === "recovered").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    outcomes,
  };

  logger.info(
    `CDP fill complete: verified=${summary.verified}/${summary.total}, recovered=${summary.recovered}, failed=${summary.failed}`,
  );
  return summary;
}

async function fillField(
  tabId: number,
  field: CDPDetectedField,
  backendNodeId: number,
  value: string,
): Promise<void> {
  const { role } = field;

  if (field.domMetadata?.isContentEditable) {
    await fillContentEditable(tabId, backendNodeId, value);
    return;
  }

  switch (role) {
    case "textbox":
    case "searchbox":
    case "textarea":
    case "spinbutton":
      await fillTextField(tabId, backendNodeId, value);
      break;

    case "checkbox":
    case "switch":
    case "menuitemcheckbox":
      await fillCheckbox(tabId, field, backendNodeId, value);
      break;

    case "radiogroup":
      await fillRadioGroup(tabId, field, backendNodeId, value);
      break;

    case "combobox":
    case "listbox":
      await fillSelectLike(tabId, backendNodeId, value);
      break;

    case "slider":
      await fillSlider(tabId, backendNodeId, value);
      break;

    default:
      logger.warn(`Unsupported role for filling: ${role}`);
  }
}

async function fillFieldWithRecoveryAndVerification(
  tabId: number,
  mapping: CDPFieldMapping,
  domDrifted: boolean,
): Promise<CDPFillOutcome> {
  const field = mapping.field;
  const requestedValue = mapping.value;
  let attempts = 0;
  let backendNodeId = await resolveFieldBackendNodeId(tabId, field, true);
  let recoveredBackendNodeId: number | undefined;
  let lastReason = "";
  let lastActualValue: string | undefined;

  if (!backendNodeId) {
    return {
      fieldOpid: field.opid,
      role: field.role,
      requestedValue,
      status: "failed",
      verified: false,
      attempts: 0,
      backendNodeId: field.backendNodeId,
      reason: "Could not resolve field node before filling",
    };
  }

  if (backendNodeId !== field.backendNodeId) {
    recoveredBackendNodeId = backendNodeId;
  }

  if (domDrifted) {
    logger.debug(
      `DOM drift detected before filling ${field.opid}; prioritizing recovery`,
    );
  }

  while (attempts < MAX_FILL_ATTEMPTS) {
    attempts++;
    try {
      await fillField(tabId, field, backendNodeId, requestedValue);
      const verification = await verifyFilledField(
        tabId,
        field,
        requestedValue,
        backendNodeId,
      );
      lastReason = verification.reason || "";
      lastActualValue = verification.actualValue;

      if (verification.verified) {
        const recovered = backendNodeId !== field.backendNodeId;
        return {
          fieldOpid: field.opid,
          role: field.role,
          requestedValue,
          status: recovered ? "recovered" : "verified",
          verified: true,
          attempts,
          backendNodeId,
          recoveredBackendNodeId,
          actualValue: verification.actualValue,
        };
      }
    } catch (error) {
      lastReason =
        error instanceof Error ? error.message : "Unexpected fill error";
    }

    if (attempts < MAX_FILL_ATTEMPTS && field.fingerprint) {
      const recoveredNodeId = await resolveFieldBackendNodeId(
        tabId,
        field,
        true,
      );
      if (recoveredNodeId && recoveredNodeId !== backendNodeId) {
        backendNodeId = recoveredNodeId;
        recoveredBackendNodeId = recoveredNodeId;
        continue;
      }
    }
    break;
  }

  return {
    fieldOpid: field.opid,
    role: field.role,
    requestedValue,
    status: "failed",
    verified: false,
    attempts,
    backendNodeId,
    recoveredBackendNodeId,
    reason: lastReason || "Verification failed",
    actualValue: lastActualValue,
  };
}

async function getDOMVersionToken(tabId: number): Promise<string | null> {
  try {
    const token = await sendCommand<{ result: { value?: string } }>(
      tabId,
      "Runtime.evaluate",
      {
        expression: `(function() {
          const body = document.body;
          const childCount = body ? body.childElementCount : 0;
          return [
            location.href,
            document.readyState,
            childCount,
            history.length
          ].join("|");
        })()`,
        returnByValue: true,
      },
    );
    return token?.result?.value ?? null;
  } catch {
    return null;
  }
}

async function fillTextField(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<void> {
  await waitForStability(tabId, backendNodeId);

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
  backendNodeId: number,
  value: string,
): Promise<void> {
  const expected = parseBooleanLike(value);
  if (expected === null) {
    logger.warn(`Checkbox ${field.opid} has non-boolean value "${value}"`);
    return;
  }
  const isChecked = await readCheckedState(tabId, backendNodeId);

  if (isChecked !== null && expected === isChecked) {
    logger.debug(`Checkbox ${field.opid} already in desired state`);
    return;
  }

  await clickNodeDirect(tabId, backendNodeId);
}

async function fillRadioGroup(
  tabId: number,
  field: CDPDetectedField,
  backendNodeId: number,
  value: string,
): Promise<void> {
  if (!field.radioOptions?.length) {
    logger.warn(`Radio group ${field.opid} has no options`);
    await selectRadioByValue(tabId, backendNodeId, value);
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
    await selectRadioByValue(tabId, backendNodeId, value);
    return;
  }

  const currentChecked = await readCheckedState(tabId, target.backendNodeId);
  if (currentChecked === true) {
    logger.debug(`Radio option "${value}" already selected`);
    return;
  }

  await clickNodeDirect(tabId, target.backendNodeId);
  const verified = await readCheckedState(tabId, target.backendNodeId);
  if (!verified) {
    await selectRadioByValue(tabId, backendNodeId, value);
  }
}

async function selectRadioByValue(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<void> {
  try {
    const resolved = await sendCommand<{ object?: { objectId?: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );
    const objectId = resolved?.object?.objectId;
    if (!objectId) return;

    await sendCommand(tabId, "Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(targetValue) {
        const norm = (v) => String(v ?? '').trim().toLowerCase();
        const expected = norm(targetValue);
        const root =
          this.closest('fieldset,[role="radiogroup"],form') ||
          this.parentElement ||
          document;
        const radios = root.querySelectorAll('input[type="radio"], [role="radio"]');
        for (const radio of radios) {
          const value = norm(radio.getAttribute('value') || radio.value || '');
          const label = norm(radio.getAttribute('aria-label') || radio.textContent || '');
          if (value === expected || label === expected) {
            radio.scrollIntoView({ block: 'nearest', behavior: 'instant' });
            radio.click();
            return true;
          }
        }
        return false;
      }`,
      arguments: [{ value }],
    });
  } catch (error) {
    logger.debug("Radio fallback selection failed:", error);
  }
}

async function waitForStability(
  tabId: number,
  backendNodeId: number,
  timeout = 1000,
): Promise<void> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );
    if (!resolved?.object?.objectId) return;

    await sendCommand<{ result: { value?: boolean } }>(
      tabId,
      "Runtime.callFunctionOn",
      {
        objectId: resolved.object.objectId,
        functionDeclaration: `function(timeoutMs) {
          return new Promise((resolve) => {
            let last = this.getBoundingClientRect();
            const start = Date.now();
            const check = () => {
              const cur = this.getBoundingClientRect();
              if (!cur.width && !cur.height) { resolve(true); return; }
              const stable = Math.abs(last.x - cur.x) < 2
                && Math.abs(last.y - cur.y) < 2
                && Math.abs(last.width - cur.width) < 2
                && Math.abs(last.height - cur.height) < 2;
              if (stable || Date.now() - start > timeoutMs) { resolve(true); return; }
              last = cur;
              setTimeout(check, 50);
            };
            setTimeout(check, 50);
          });
        }`,
        arguments: [{ value: timeout }],
        awaitPromise: true,
        returnByValue: true,
      },
    );
  } catch {
    // Non-critical; proceed even if stability check fails
  }
}

async function clickNodeDirect(
  tabId: number,
  backendNodeId: number,
): Promise<void> {
  try {
    await waitForStability(tabId, backendNodeId);

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
  backendNodeId: number,
  value: string,
): Promise<void> {
  if (await tryNativeSelect(tabId, backendNodeId, value)) return;

  if (await tryAriaControlledOption(tabId, backendNodeId, value)) return;

  await fillCustomCombobox(tabId, backendNodeId, value);
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
      result: { type: string; value: boolean };
    }>(tabId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function(targetValue) {
        const el = this;
        const listboxId = el.getAttribute('aria-owns') || el.getAttribute('aria-controls');
        if (!listboxId) return false;
        const tl = targetValue.toLowerCase();
        for (const id of listboxId.split(/\\s+/)) {
          const listbox = document.getElementById(id);
          if (!listbox) continue;
          const opts = listbox.querySelectorAll('[role="option"], li[data-value], li');
          for (const opt of opts) {
            const optValue = opt.getAttribute('data-value') || opt.getAttribute('value') || opt.textContent.trim();
            if (optValue.toLowerCase() === tl || opt.textContent.trim().toLowerCase() === tl) {
              opt.scrollIntoView({ block: 'nearest', behavior: 'instant' });
              opt.click();
              return true;
            }
          }
        }
        return false;
      }`,
      arguments: [{ value }],
      returnByValue: true,
    });

    return result?.result?.value === true;
  } catch {
    return false;
  }
}

async function fillCustomCombobox(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<void> {
  await clickNodeDirect(tabId, backendNodeId);
  await delay(300);

  const clicked = await clickMatchingOption(tabId, backendNodeId, value);
  if (clicked) return;

  await focusNode(tabId, backendNodeId);
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

  const clickedAfterType = await clickMatchingOption(
    tabId,
    backendNodeId,
    value,
  );
  if (!clickedAfterType) {
    await dispatchKey(tabId, "Enter", "Enter");
  }
}

async function clickMatchingOption(
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
        const tl = targetValue.toLowerCase();

        const findAndClick = (root) => {
          const opts = root.querySelectorAll('[role="option"]');
          for (const opt of opts) {
            const optValue = opt.getAttribute('data-value') || opt.getAttribute('value') || opt.textContent.trim();
            if (optValue.toLowerCase() === tl || opt.textContent.trim().toLowerCase() === tl) {
              opt.scrollIntoView({ block: 'nearest', behavior: 'instant' });
              opt.click();
              return true;
            }
          }
          return false;
        };

        // 1. Try aria-controls/aria-owns linked listbox
        const ctrlId = this.getAttribute('aria-controls') || this.getAttribute('aria-owns');
        if (ctrlId) {
          for (const id of ctrlId.split(/\\s+/)) {
            const lb = document.getElementById(id);
            if (lb && findAndClick(lb)) return true;
          }
        }

        // 2. Search nearby in parent containers
        let container = this.parentElement;
        let depth = 0;
        while (container && depth < 4) {
          const listbox = container.querySelector('[role="listbox"]');
          if (listbox && !this.contains(listbox) && findAndClick(listbox)) return true;
          if (findAndClick(container)) return true;
          container = container.parentElement;
          depth++;
        }

        // 3. Broad document search for visible listboxes
        const allListboxes = document.querySelectorAll('[role="listbox"]');
        for (const lb of allListboxes) {
          const style = window.getComputedStyle(lb);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (findAndClick(lb)) return true;
        }

        return false;
      }`,
      arguments: [{ value }],
      returnByValue: true,
    });

    return result?.result?.value === true;
  } catch {
    return false;
  }
}

async function fillSlider(
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
    logger.error(`Failed to fill slider on node ${backendNodeId}:`, error);
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
