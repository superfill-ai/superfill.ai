import { delay } from "@/lib/delay";
import { createLogger } from "@/lib/logger";

const logger = createLogger("fill-handler");

export type TextFieldElement = HTMLInputElement | HTMLTextAreaElement;

export const normalizeFillValue = (value: string): string =>
  value.trim().toLowerCase();

const setNativeTextValue = (element: TextFieldElement, value: string): void => {
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
};

export const fillWithHumanTyping = async (
  element: TextFieldElement,
  value: string,
): Promise<boolean> => {
  try {
    element.focus();
    setNativeTextValue(element, "");
    element.dispatchEvent(new Event("focus", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true }));

    await delay(50);

    for (let i = 0; i < value.length; i++) {
      const char = value[i];

      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: char,
          bubbles: true,
          cancelable: true,
        }),
      );

      setNativeTextValue(element, value.substring(0, i + 1));

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
    if (error instanceof Error) {
      logger.info("Human typing failed:", error);
    } else {
      logger.info("Human typing failed: unknown error");
    }
    return false;
  }
};

export const fillWithNativeSetter = (
  element: TextFieldElement,
  value: string,
): void => {
  setNativeTextValue(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

export const fillReactSelect = async (
  element: HTMLInputElement,
  value: string,
): Promise<boolean> => {
  try {
    logger.info("React Select: attempting to fill requested value");

    const selectContainer = element.closest(
      '.select, .select__container, [class*="select"]',
    );
    if (selectContainer) {
      const hiddenInput = selectContainer.querySelector<HTMLInputElement>(
        'input[type="hidden"], input[aria-hidden="true"], input[tabindex="-1"]:not([role])',
      );
      if (hiddenInput && hiddenInput !== element) {
        logger.info("React Select: found hidden input, setting value directly");

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

    logger.info(`React Select: menu found: ${!!menuEl}`);

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

    logger.info(`React Select: found ${options.length} options`);

    const normalizedValue = normalizeFillValue(value);
    let matchedOption: HTMLElement | null = null;

    for (const option of options) {
      const optionText = normalizeFillValue(option.textContent ?? "");
      logger.info(`React Select: checking option "${optionText}"`);

      if (optionText === normalizedValue) {
        matchedOption = option;
        break;
      }
      if (!matchedOption && optionText.includes(normalizedValue)) {
        matchedOption = option;
      }
    }

    if (matchedOption) {
      logger.info("React Select: clicking matched option");
      matchedOption.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      await delay(50);
      matchedOption.click();
      return true;
    }

    logger.info("React Select: no direct match, trying to type and filter");

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

    logger.info(
      `React Select: found ${filteredOptions.length} filtered options`,
    );

    if (filteredOptions.length > 0) {
      const firstOption = filteredOptions[0];
      logger.info("React Select: clicking first filtered option");
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

    logger.info("React Select: pressed Enter as fallback");
    return true;
  } catch (error) {
    if (error instanceof Error) {
      logger.error("Error filling React Select:", error);
    } else {
      logger.error("Error filling React Select: unknown error");
    }
    return false;
  }
};
