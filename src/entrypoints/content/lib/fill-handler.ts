import { delay } from "@/lib/delay";
import { createLogger } from "@/lib/logger";
import type {
  DetectedField,
  FieldOpId,
  FieldsToFillData,
} from "@/types/autofill";

const logger = createLogger("fill-handler");

const fillWithHumanTyping = async (
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<boolean> => {
  try {
    element.focus();
    element.value = "";
    element.dispatchEvent(new Event("focus", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true }));

    await delay(50);

    for (let i = 0; i < value.length; i++) {
      const char = value[i];

      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: char,
          code: `Key${char.toUpperCase()}`,
          bubbles: true,
          cancelable: true,
        }),
      );

      element.value = value.substring(0, i + 1);

      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: char,
          inputType: "insertText",
        }),
      );

      element.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: char,
          code: `Key${char.toUpperCase()}`,
          bubbles: true,
        }),
      );

      await delay(30 + Math.random() * 20);
    }

    await delay(50);
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));

    return true;
  } catch (error) {
    logger.debug("Human typing failed:", error);
    return false;
  }
};

const fillWithNativeSetter = (
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void => {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const fillReactSelect = async (
  element: HTMLInputElement,
  value: string,
): Promise<boolean> => {
  try {
    logger.debug(`React Select: attempting to fill with value "${value}"`);

    const selectContainer = element.closest(
      '.select, .select__container, [class*="select"]',
    );
    if (selectContainer) {
      const hiddenInput = selectContainer.querySelector<HTMLInputElement>(
        'input[type="hidden"], input[aria-hidden="true"], input[tabindex="-1"]:not([role])',
      );
      if (hiddenInput && hiddenInput !== element) {
        logger.debug(
          `React Select: found hidden input, setting value directly`,
        );

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(hiddenInput, value);
        } else {
          hiddenInput.value = value;
        }

        hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    element.focus();

    element.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    await delay(50);

    const controlContainer = element.closest('[class*="control"]');
    if (controlContainer) {
      controlContainer.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    }

    await delay(200);

    let menuEl: Element | null = null;

    const listboxId = element.getAttribute("aria-controls");
    if (listboxId) {
      menuEl = document.getElementById(listboxId);
    }

    if (!menuEl) {
      menuEl = document.querySelector(
        '[class*="menu"]:not([class*="menu-"]), [class*="-menu"], .select__menu',
      );
    }

    logger.debug(`React Select: menu found: ${!!menuEl}`);

    let options: NodeListOf<HTMLElement> | HTMLElement[] = [];

    if (menuEl) {
      options = menuEl.querySelectorAll<HTMLElement>(
        '[class*="option"], [role="option"]',
      );
    } else {
      options = document.querySelectorAll<HTMLElement>(
        '[class*="select__option"], [id*="react-select"][id*="option"]',
      );
    }

    logger.debug(`React Select: found ${options.length} options`);

    const normalizedValue = value.toLowerCase().trim();
    let matchedOption: HTMLElement | null = null;

    for (const option of options) {
      const optionText = option.textContent?.toLowerCase().trim() || "";
      logger.debug(`React Select: checking option "${optionText}"`);

      if (optionText === normalizedValue) {
        matchedOption = option;
        break;
      }
      if (!matchedOption && optionText.includes(normalizedValue)) {
        matchedOption = option;
      }
    }

    if (matchedOption) {
      logger.debug(
        `React Select: clicking matched option "${matchedOption.textContent}"`,
      );
      matchedOption.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      await delay(50);
      matchedOption.click();
      return true;
    }

    logger.debug("React Select: no direct match, trying to type and filter");

    element.value = "";
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "",
        inputType: "deleteContentBackward",
      }),
    );

    for (const char of value) {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, bubbles: true }),
      );
      element.value += char;
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: char,
          inputType: "insertText",
        }),
      );
      await delay(30);
    }

    await delay(200);

    const filteredOptions = document.querySelectorAll<HTMLElement>(
      '[class*="select__option"], [id*="react-select"][id*="option"], [role="option"]',
    );

    logger.debug(
      `React Select: found ${filteredOptions.length} filtered options`,
    );

    if (filteredOptions.length > 0) {
      const firstOption = filteredOptions[0];
      logger.debug(
        `React Select: clicking first filtered option "${firstOption.textContent}"`,
      );
      firstOption.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      await delay(50);
      firstOption.click();
      return true;
    }

    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
      }),
    );

    logger.debug(`React Select: pressed Enter as fallback`);
    return true;
  } catch (error) {
    logger.error("Error filling React Select:", error);
    return false;
  }
};

export const handleFill = async (
  fieldsToFill: FieldsToFillData,
  frameInfo: { isMainFrame: boolean },
  fieldCache: Map<FieldOpId, DetectedField>,
) => {
  logger.debug(
    `Filling ${fieldsToFill.length} fields in ${frameInfo.isMainFrame ? "main frame" : "iframe"}`,
  );

  for (const { fieldOpid, value } of fieldsToFill) {
    const field = fieldCache.get(fieldOpid as FieldOpId);

    if (!field) {
      logger.warn(`Field ${fieldOpid} not in cache, skipping`);
      continue;
    }

    if (field) {
      const element = field.element;

      if (element instanceof HTMLInputElement) {
        element.focus({ preventScroll: true });

        if (element.type === "radio") {
          const radioName = element.name;
          if (radioName) {
            const radios = document.querySelectorAll<HTMLInputElement>(
              `input[type="radio"][name="${radioName}"]`,
            );

            let matched = false;
            const normalizedValue = value.toLowerCase().trim();

            for (const radio of radios) {
              const radioValue = radio.value.toLowerCase().trim();
              const radioLabel =
                radio.labels?.[0]?.textContent?.toLowerCase().trim() || "";

              if (
                radioValue === normalizedValue ||
                radioLabel === normalizedValue
              ) {
                radio.checked = true;
                radio.dispatchEvent(new Event("input", { bubbles: true }));
                radio.dispatchEvent(new Event("change", { bubbles: true }));
                matched = true;
                logger.debug(
                  `Radio group ${radioName}: selected value "${radio.value}"`,
                );
                break;
              }
            }

            if (!matched) {
              logger.warn(
                `Radio group ${radioName}: no option matched value "${value}"`,
              );
            }
          }
        } else if (element.type === "checkbox") {
          const normalizedCheckboxValue = value.trim().toLowerCase();

          element.checked =
            normalizedCheckboxValue === "true" ||
            normalizedCheckboxValue === "on" ||
            normalizedCheckboxValue === "1";
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (element.getAttribute("role") === "combobox") {
          await fillReactSelect(element, value);
        } else {
          const success = await fillWithHumanTyping(element, value);
          if (!success) {
            fillWithNativeSetter(element, value);
          }
        }
      } else if (element instanceof HTMLTextAreaElement) {
        element.focus({ preventScroll: true });
        const success = await fillWithHumanTyping(element, value);
        if (!success) {
          fillWithNativeSetter(element, value);
        }
      } else if (element instanceof HTMLSelectElement) {
        const normalizedValue = value.toLowerCase();
        let matched = false;

        for (const option of Array.from(element.options)) {
          if (
            option.value.toLowerCase() === normalizedValue ||
            option.text.toLowerCase() === normalizedValue
          ) {
            option.selected = true;
            matched = true;
            break;
          }
        }

        if (!matched) {
          element.value = value;
        }

        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }

      logger.debug(`Filled field ${fieldOpid} with value`);
    } else {
      logger.warn(`Field ${fieldOpid} not found in cache`);
    }
  }
};
