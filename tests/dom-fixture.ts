import { Window } from "happy-dom";

const FIELD_SELECTOR = "input, textarea, select";

export function installDom(html: string, url: string): void {
  const window = new Window({ url, width: 1280, height: 800 });
  window.document.body.innerHTML = html;

  installGlobals(window);
  patchLayout(window);
}

export function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
  elementClass: { new (): T; readonly name: string },
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof elementClass)) {
    throw new Error(`Expected ${selector} to match ${elementClass.name}`);
  }
  return element;
}

function installGlobals(window: Window): void {
  const globals = [
    ["window", window],
    ["self", window],
    ["document", window.document],
    ["navigator", window.navigator],
    ["location", window.location],
    ["Node", window.Node],
    ["Element", window.Element],
    ["HTMLElement", window.HTMLElement],
    ["HTMLInputElement", window.HTMLInputElement],
    ["HTMLTextAreaElement", window.HTMLTextAreaElement],
    ["HTMLSelectElement", window.HTMLSelectElement],
    ["HTMLFormElement", window.HTMLFormElement],
    ["HTMLButtonElement", window.HTMLButtonElement],
    ["HTMLOptionElement", window.HTMLOptionElement],
    ["HTMLOutputElement", window.HTMLOutputElement],
    ["ShadowRoot", window.ShadowRoot],
    ["NodeFilter", window.NodeFilter],
    ["DOMRect", window.DOMRect],
    ["CSS", window.CSS],
    ["Event", window.Event],
    ["InputEvent", window.InputEvent],
    ["KeyboardEvent", window.KeyboardEvent],
    ["MouseEvent", window.MouseEvent],
    ["FocusEvent", window.FocusEvent],
    ["CSSStyleDeclaration", window.CSSStyleDeclaration],
    ["IS_REACT_ACT_ENVIRONMENT", true],
    ["requestAnimationFrame", window.requestAnimationFrame.bind(window)],
    ["cancelAnimationFrame", window.cancelAnimationFrame.bind(window)],
  ] as const;

  for (const [key, value] of globals) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
}

function patchLayout(window: Window): void {
  type HappyHTMLElement = InstanceType<typeof window.HTMLElement>;

  Object.defineProperty(window.HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get: function offsetParent(this: HappyHTMLElement) {
      return this.isConnected && !this.hasAttribute("hidden")
        ? window.document.body
        : null;
    },
  });

  Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: function offsetWidth(this: HappyHTMLElement): number {
      return this.getBoundingClientRect().width;
    },
  });

  Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: function offsetHeight(this: HappyHTMLElement): number {
      return this.getBoundingClientRect().height;
    },
  });

  window.HTMLElement.prototype.getBoundingClientRect =
    function getBoundingClientRect(this: HappyHTMLElement) {
      const fields = Array.from(
        window.document.querySelectorAll(FIELD_SELECTOR),
      );
      const fieldIndex = fields.indexOf(this);
      const index = fieldIndex >= 0 ? fieldIndex : fields.length;
      return new window.DOMRect(24, 24 + index * 48, 240, 32);
    };

  window.document.elementFromPoint = (x: number, y: number) => {
    const fields = Array.from(window.document.querySelectorAll(FIELD_SELECTOR));
    return (
      fields.find((element) => {
        const rect = element.getBoundingClientRect();
        return (
          x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
        );
      }) ?? window.document.body
    );
  };
}
