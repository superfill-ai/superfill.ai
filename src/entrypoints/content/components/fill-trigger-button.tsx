import { createLogger } from "@/lib/logger";
import { store } from "@/lib/storage";

const logger = createLogger("content:fill-trigger");

const STYLES = `
  :host {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
    --primary: 222.2 47.6% 11.3%;
    --accent: 210 40% 96%;
  }
  :host(.dark) {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --primary: 210 40% 98%;
    --accent: 217.2 32.6% 17.5%;
  }
  * {
    margin: 0;
    padding: 0;
    border: none;
    box-sizing: border-box;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    user-select: none;
    box-shadow: 0 4px 12px hsl(0 0% 0% / 0.1);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  button:hover {
    background: hsl(var(--accent));
    border-color: hsl(var(--primary));
    box-shadow: 0 6px 16px hsl(0 0% 0% / 0.15);
  }
  button:active {
    transform: scale(0.98);
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }
  svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { animation: spin 1s linear infinite; }
`;

export class FillTriggerButton {
  private host: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;
  private onClickHandler: ((e: MouseEvent) => void) | null = null;
  private onClickOutside: ((e: MouseEvent) => void) | null = null;
  private onEscapeKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(private onFillClick: () => Promise<void>) {}

  private async applyTheme(host: HTMLElement): Promise<void> {
    try {
      const theme = await store.theme.getValue();

      host.classList.remove("light", "dark");

      if (theme === "light") {
        host.classList.add("light");
      } else if (theme === "dark") {
        host.classList.add("dark");
      } else {
        const isDarkMode =
          document.documentElement.classList.contains("dark") ||
          window.matchMedia("(prefers-color-scheme: dark)").matches;
        host.classList.add(isDarkMode ? "dark" : "light");
      }
    } catch (error) {
      logger.warn("Failed to apply theme:", error);
      host.classList.add("light");
    }
  }

  async mount(targetField: HTMLElement) {
    try {
      this.remove();

      if (!document.body.contains(targetField)) {
        logger.warn("Target field not in document");
        return;
      }

      const rect = targetField.getBoundingClientRect();

      this.host = document.createElement("div");
      this.host.id = "superfill-trigger-host";
      this.host.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        pointer-events: auto;
        margin: 0;
        padding: 0;
        display: block;
      `;

      const left = Math.round(rect.left);
      const top = Math.round(rect.bottom + 4);

      this.host.style.left = `${left}px`;
      this.host.style.top = `${top}px`;
      this.host.style.width = `${Math.round(rect.width)}px`;

      document.body.appendChild(this.host);

      const shadow = this.host.attachShadow({ mode: "open" });

      const styleEl = document.createElement("style");
      styleEl.textContent = STYLES;
      shadow.appendChild(styleEl);

      await this.applyTheme(this.host);

      this.button = document.createElement("button");
      this.button.className = "trigger-btn";
      this.button.type = "button";
      this.button.setAttribute("aria-label", "Fill with superfill.ai");
      this.button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="30px" height="30px" viewBox="0 0 30 30" version="1.1" style="border-radius: 25%;" class="trigger-icon">
<g id="surface1">
<path style=" stroke:none;fill-rule:nonzero;fill:rgb(99.607843%,86.274511%,66.274512%);fill-opacity:1;" d="M 0 0 C 9.898438 0 19.800781 0 30 0 C 30 9.898438 30 19.800781 30 30 C 20.101562 30 10.199219 30 0 30 C 0 20.101562 0 10.199219 0 0 Z M 0 0 "/>
<path style=" stroke:none;fill-rule:nonzero;fill:rgb(85.882354%,54.901963%,38.039216%);fill-opacity:1;" d="M 20.347656 5.261719 C 21.035156 5.839844 21.511719 6.703125 21.609375 7.597656 C 21.671875 8.402344 21.734375 9.273438 21.386719 10.019531 C 21.363281 10.074219 21.339844 10.128906 21.316406 10.183594 C 20.878906 11.082031 20.082031 11.71875 19.160156 12.070312 C 18.90625 12.15625 18.652344 12.230469 18.398438 12.304688 C 18.386719 12.433594 18.386719 12.433594 18.503906 12.53125 C 18.550781 12.574219 18.601562 12.617188 18.652344 12.660156 C 18.703125 12.707031 18.757812 12.753906 18.816406 12.804688 C 18.96875 12.9375 19.128906 13.0625 19.289062 13.191406 C 20.683594 14.324219 21.769531 15.789062 22.050781 17.597656 C 22.152344 18.613281 22.1875 19.648438 21.855469 20.625 C 21.839844 20.679688 21.824219 20.734375 21.804688 20.792969 C 21.570312 21.527344 21.132812 22.214844 20.625 22.792969 C 20.558594 22.871094 20.558594 22.871094 20.496094 22.949219 C 19.480469 24.125 18.066406 24.855469 16.609375 25.332031 C 16.519531 25.359375 16.519531 25.359375 16.429688 25.386719 C 15.625 25.640625 14.847656 25.757812 14.003906 25.75 C 13.960938 25.75 13.921875 25.746094 13.878906 25.746094 C 12.085938 25.738281 10.539062 25.339844 9.199219 24.082031 C 8.59375 23.464844 8.234375 22.628906 8.027344 21.796875 C 8.007812 21.726562 8.007812 21.726562 7.988281 21.652344 C 7.625 20.082031 8.066406 18.433594 8.894531 17.097656 C 9.074219 16.828125 9.273438 16.585938 9.492188 16.347656 C 9.5625 16.269531 9.5625 16.269531 9.636719 16.191406 C 10.136719 15.660156 10.734375 15.238281 11.484375 15.210938 C 11.847656 15.226562 12.164062 15.300781 12.453125 15.527344 C 12.789062 16.222656 12.382812 17.328125 12.171875 18.027344 C 11.875 19.023438 11.871094 20.246094 12.320312 21.191406 C 12.523438 21.542969 12.8125 21.75 13.183594 21.914062 C 14.105469 22.132812 15.214844 22.046875 16.046875 21.585938 C 16.1875 21.496094 16.1875 21.496094 16.304688 21.40625 C 16.40625 21.328125 16.40625 21.328125 16.53125 21.273438 C 16.671875 21.195312 16.695312 21.125 16.757812 20.976562 C 16.84375 20.835938 16.929688 20.699219 17.019531 20.5625 C 17.277344 20.070312 17.3125 19.628906 17.3125 19.078125 C 17.3125 19.011719 17.3125 18.945312 17.3125 18.875 C 17.3125 17.421875 16.21875 16.347656 15.265625 15.371094 C 15.089844 15.195312 14.90625 15.042969 14.714844 14.890625 C 13.445312 13.867188 12.398438 12.640625 11.894531 11.074219 C 11.878906 11.027344 11.863281 10.976562 11.847656 10.925781 C 11.71875 10.515625 11.691406 10.132812 11.699219 9.703125 C 11.703125 9.609375 11.703125 9.609375 11.703125 9.507812 C 11.722656 8.21875 12.070312 7.011719 12.949219 6.035156 C 12.980469 6 13.011719 5.964844 13.042969 5.929688 C 13.730469 5.179688 14.769531 4.613281 15.761719 4.394531 C 15.8125 4.382812 15.859375 4.371094 15.910156 4.359375 C 17.410156 4.046875 19.117188 4.328125 20.347656 5.261719 Z M 20.347656 5.261719 "/>
<path style=" stroke:none;fill-rule:nonzero;fill:rgb(99.607843%,86.274511%,66.274512%);fill-opacity:1;" d="M 18.648438 7.46875 C 18.867188 7.664062 18.976562 7.84375 19.015625 8.132812 C 19.015625 8.214844 19.015625 8.296875 19.015625 8.378906 C 19.011719 8.421875 19.011719 8.464844 19.011719 8.511719 C 18.96875 9.714844 18.304688 10.785156 17.460938 11.601562 C 17.191406 11.480469 17.015625 11.292969 16.808594 11.085938 C 16.75 11.027344 16.75 11.027344 16.691406 10.964844 C 15.921875 10.175781 15.148438 9.167969 14.976562 8.050781 C 15.027344 7.746094 15.351562 7.558594 15.585938 7.382812 C 15.757812 7.28125 15.925781 7.210938 16.113281 7.148438 C 16.152344 7.136719 16.191406 7.121094 16.230469 7.109375 C 17.066406 6.875 17.917969 7.023438 18.648438 7.46875 Z M 18.648438 7.46875 "/>
</g>
</svg>
        <span class="trigger-text">Fill with superfill.ai</span>
      `;

      this.onClickHandler = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        void this.handleClick();
      };
      this.button.addEventListener("click", this.onClickHandler);

      shadow.appendChild(this.button);

      this.onClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (this.host && !this.host.contains(target)) {
          this.remove();
        }
      };

      setTimeout(() => {
        if (this.onClickOutside) {
          window.addEventListener("mousedown", this.onClickOutside, true);
        }
      }, 0);

      this.onEscapeKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          this.remove();
        }
      };
      window.addEventListener("keydown", this.onEscapeKey, true);

      logger.info("Fill trigger mounted");
    } catch (err) {
      logger.error("Mount error:", err);
      this.remove();
    }
  }

  private async handleClick() {
    if (!this.button) return;
    this.button.disabled = true;
    logger.info("Superfill button clicked");
    await this.onFillClick();
    this.remove();
  }

  remove() {
    try {
      if (this.onClickHandler && this.button) {
        this.button.removeEventListener("click", this.onClickHandler);
      }
      if (this.onClickOutside) {
        window.removeEventListener("mousedown", this.onClickOutside, true);
      }
      if (this.onEscapeKey) {
        window.removeEventListener("keydown", this.onEscapeKey, true);
      }

      if (this.host?.parentElement) {
        this.host.parentElement.removeChild(this.host);
      }

      this.host = null;
      this.button = null;
      this.onClickHandler = null;
      this.onClickOutside = null;
      this.onEscapeKey = null;

      logger.debug("Fill trigger removed");
    } catch (err) {
      logger.warn("Remove error:", err);
    }
  }
}
