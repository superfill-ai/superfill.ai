import { delay } from "@/lib/delay";
import { createLogger } from "@/lib/logger";
import type {
  DetectedField,
  FieldOpId,
  FieldsToFillData,
  FormFieldElement,
} from "@/types/autofill";

const logger = createLogger("fill-handler");

const fillCustomRadioButton = async (
  element: HTMLElement,
  value: string,
): Promise<boolean> => {
  try {
    logger.debug(`Custom radio button: attempting to fill with value "${value}"`);

    let radioGroup: Element | null = element.closest('[role="radiogroup"]');
    
    if (!radioGroup) {
      const opid = element.getAttribute('data-superfill-opid');
      if (opid) {
        const allWithOpid = document.querySelectorAll(`[data-superfill-opid="${opid}"]`);
        for (const el of allWithOpid) {
          radioGroup = el.closest('[role="radiogroup"]');
          if (radioGroup) break;
        }
      }
    }
    
    if (!radioGroup) {
      logger.warn('No radiogroup found for custom radio button');
      return false;
    }

    const radioOptions = radioGroup.querySelectorAll('[role="radio"]');
    const normalizedValue = value.toLowerCase().trim();

    for (const radio of Array.from(radioOptions)) {
      const label = (radio.getAttribute('aria-label') || radio.textContent)?.toLowerCase().trim();
      const dataValue = radio.getAttribute('data-value')?.toLowerCase().trim();
      
      if (label === normalizedValue || dataValue === normalizedValue) {
        (radio as HTMLElement).click();
        await delay(100);
        
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        
        logger.debug(`Selected custom radio option: ${label}`);
        return true;
      }
    }

    logger.warn(`No custom radio option matched value "${value}"`);
    return false;
  } catch (error) {
    logger.error('Error filling custom radio button:', error);
    return false;
  }
};

const fillCustomDropdown = async (
  element: HTMLElement,
  value: string,
): Promise<boolean> => {
  try {
    logger.debug(`Custom dropdown: attempting to fill with value "${value}"`);
    
    const role = element.getAttribute('role');
    
    const parent = element.parentElement;
    if (parent) {
      const selectElem = parent.querySelector('select');
      if (selectElem) {
        const normalizedValue = value.toLowerCase().trim();
        for (const option of Array.from(selectElem.options)) {
          const optionText = (option.textContent || option.value).toLowerCase().trim();
          if (optionText === normalizedValue || option.value.toLowerCase().trim() === normalizedValue) {
            selectElem.value = option.value;
            selectElem.dispatchEvent(new Event('change', { bubbles: true }));
            selectElem.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
        }
      }
    }
    
    if (role === 'listbox' || role === 'combobox') {
      let isExpanded = element.getAttribute('aria-expanded') === 'true';
      
      if (!isExpanded) {
        const clickableArea = element.querySelector('[jsname="LgbsSe"]') || element;
        
        const mousedownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
          detail: 1
        });
        const mouseupEvent = new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          view: window,
          detail: 1
        });
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          detail: 1
        });
        
        (clickableArea as HTMLElement).dispatchEvent(mousedownEvent);
        await delay(10);
        (clickableArea as HTMLElement).dispatchEvent(mouseupEvent);
        await delay(10);
        (clickableArea as HTMLElement).dispatchEvent(clickEvent);
        await delay(100);
        
        let waitAttempts = 0;
        while (waitAttempts < 30) {
          isExpanded = element.getAttribute('aria-expanded') === 'true';
          if (isExpanded) {
            break;
          }
          await delay(50);
          waitAttempts++;
        }
        
        await delay(300);
      }
      
      let options = element.querySelectorAll('[role="option"]');
      
      if (options.length === 0) {
        const container = element.closest('[role="group"], [jscontroller], .freebirdFormviewerComponentsQuestionBaseRoot');
        if (container) {
          options = container.querySelectorAll('[role="option"]');
        }
      }
      
      const normalizedValue = value.toLowerCase().trim();
      
      for (const option of Array.from(options)) {
        const optionEl = option as HTMLElement;
        
        const optionText = optionEl.textContent?.toLowerCase().trim() || '';
        const dataValue = optionEl.getAttribute('data-value')?.toLowerCase().trim() || '';
        const ariaLabel = optionEl.getAttribute('aria-label')?.toLowerCase().trim() || '';
        
        let isVisible = true;
        if (isExpanded) {
          const rect = optionEl.getBoundingClientRect();
          isVisible = rect.width > 0 && rect.height > 0;
        }
        
        if (!isVisible && isExpanded) {
          continue;
        }
        
        if (optionText === normalizedValue || dataValue === normalizedValue || ariaLabel === normalizedValue) {
          optionEl.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          await delay(50);
          
          const optionMouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: 1
          });
          const optionMouseUp = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: 1
          });
          const optionClick = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: 1
          });
          
          optionEl.dispatchEvent(optionMouseDown);
          await delay(10);
          optionEl.dispatchEvent(optionMouseUp);
          await delay(10);
          optionEl.dispatchEvent(optionClick);
          await delay(200);
          
          logger.debug(`Filled ARIA dropdown with value "${value}"`);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    logger.error("Error filling custom dropdown:", error);
    return false;
  }
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
    let field = fieldCache.get(fieldOpid as FieldOpId);

    if (!field) {
      const element = document.querySelector(
        `[data-superfill-opid="${fieldOpid}"]`,
      ) as FormFieldElement;
      if (element) {
        logger.debug(
          `Field ${fieldOpid} not in cache, found via data-superfill-opid attribute`,
        );
        field = { element } as DetectedField;
      }
    }

    if (field) {
      const element = field.element;

      if (element instanceof HTMLElement) {
        const role = element.getAttribute("role");
        
        if (role === "radio" || element.closest('[role="radiogroup"]')) {
          await fillCustomRadioButton(element, value);
          logger.debug(`Filled custom radio button ${fieldOpid} with value`);
          continue;
        }
        
        if (role === "combobox" || role === "listbox") {
          await fillCustomDropdown(element, value);
          logger.debug(`Filled custom dropdown ${fieldOpid} with value`);
          continue;
        }
      }

      if (element instanceof HTMLInputElement) {
        element.focus({ preventScroll: true });

        if (element.type === "radio") {
          const radioName = element.name;
          if (radioName) {
            const radios = document.querySelectorAll<HTMLInputElement>(
              `input[type="radio"][data-superfill-opid="${fieldOpid}"]`,
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
          element.value = value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } else if (element instanceof HTMLTextAreaElement) {
        element.focus({ preventScroll: true });
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
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
