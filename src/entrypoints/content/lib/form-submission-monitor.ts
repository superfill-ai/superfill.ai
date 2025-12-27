import { createLogger } from "@/lib/logger";
import type { FieldOpId } from "@/types/autofill";

const logger = createLogger("form-submission-monitor");

const SUBMIT_BUTTON_KEYWORDS = [
  "submit",
  "send",
  "continue",
  "next",
  "proceed",
  "login",
  "log in",
  "sign in",
  "signin",
  "signup",
  "sign up",
  "register",
  "apply",
  "save",
  "confirm",
  "verify",
  "complete",
  "finish",
  "checkout",
  "place order",
  "subscribe",
];

type SubmissionCallback = (
  submittedFields: Set<FieldOpId>,
) => void | Promise<void>;

const SUBMISSION_DEBOUNCE_MS = 500;

export class FormSubmissionMonitor {
  private submissionCallbacks: Set<SubmissionCallback> = new Set();
  private formListeners: Map<HTMLFormElement, () => void> = new Map();
  private buttonListeners: Map<
    HTMLButtonElement | HTMLInputElement,
    () => void
  > = new Map();
  private recentFormSubmissions: WeakMap<HTMLFormElement, number> =
    new WeakMap();
  private lastStandaloneSubmission: number = 0;
  private isMonitoring = false;
  private observer: MutationObserver | null = null;

  start(): void {
    if (this.isMonitoring) {
      logger.warn("Form submission monitor already started");
      return;
    }

    this.attachExistingFormListeners();
    this.attachSubmitButtonListeners();
    this.startMutationObserver();
    this.isMonitoring = true;

    logger.debug("Form submission monitor started");
  }

  dispose(): void {
    if (!this.isMonitoring) return;

    this.removeAllListeners();

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.isMonitoring = false;
    logger.debug("Form submission monitor stopped");
  }

  onSubmission(callback: SubmissionCallback): () => void {
    this.submissionCallbacks.add(callback);
    return () => {
      this.submissionCallbacks.delete(callback);
    };
  }

  private attachExistingFormListeners(): void {
    const forms = document.querySelectorAll<HTMLFormElement>("form");

    for (const form of forms) {
      this.attachFormListener(form);
    }

    logger.debug(`Attached listeners to ${forms.length} forms`);
  }

  private attachFormListener(form: HTMLFormElement): void {
    if (this.formListeners.has(form)) return;

    const listener = async (event: Event) => {
      try {
        event.preventDefault();
        logger.debug("Form submit event detected", form);

        await this.handleFormSubmission(form);
      } catch (error) {
        logger.error("Error handling form submission:", error);
      } finally {
        form.submit();
      }
    };

    form.addEventListener("submit", listener);
    this.formListeners.set(form, () => {
      form.removeEventListener("submit", listener);
    });
  }

  private attachSubmitButtonListeners(): void {
    const buttons = this.findSubmitButtons();

    for (const button of buttons) {
      this.attachButtonListener(button);
    }

    logger.debug(`Attached listeners to ${buttons.length} submit buttons`);
  }

  private findSubmitButtons(): Array<HTMLButtonElement | HTMLInputElement> {
    const buttons: Array<HTMLButtonElement | HTMLInputElement> = [];

    const allButtons = document.querySelectorAll<
      HTMLButtonElement | HTMLInputElement
    >("button, input[type='button'], input[type='submit']");

    for (const button of allButtons) {
      if (this.isSubmitButton(button)) {
        buttons.push(button);
      }
    }

    return buttons;
  }

  private isSubmitButton(element: HTMLElement): boolean {
    if (element instanceof HTMLInputElement && element.type === "submit") {
      return true;
    }

    if (element instanceof HTMLButtonElement && element.type === "submit") {
      return true;
    }

    const text = (
      element.textContent ||
      element.getAttribute("value") ||
      element.getAttribute("aria-label") ||
      ""
    ).toLowerCase();

    const id = (element.getAttribute("id") || "").toLowerCase();
    const className = (element.getAttribute("class") || "").toLowerCase();
    const name = (element.getAttribute("name") || "").toLowerCase();

    const searchText = `${text} ${id} ${className} ${name}`;

    return SUBMIT_BUTTON_KEYWORDS.some((keyword) =>
      searchText.includes(keyword),
    );
  }

  private attachButtonListener(
    button: HTMLButtonElement | HTMLInputElement,
  ): void {
    if (this.buttonListeners.has(button)) return;

    const listener = async () => {
      logger.debug("Submit button clicked", button);
      const form = button.closest("form");
      if (form) {
        await this.handleFormSubmission(form);
      } else {
        await this.handleStandaloneSubmission();
      }
    };

    button.addEventListener("click", listener);
    this.buttonListeners.set(button, listener);
  }

  private async handleFormSubmission(form: HTMLFormElement): Promise<void> {
    if (this.isDuplicateSubmission(form)) {
      logger.debug("Skipping duplicate form submission");
      return;
    }

    this.recentFormSubmissions.set(form, Date.now());
    const fields = this.extractFieldOpids(form);
    logger.debug(`Form submission detected with ${fields.size} fields`);
    await this.notifyCallbacks(fields);
  }

  private async handleStandaloneSubmission(): Promise<void> {
    if (this.isDuplicateSubmission("standalone")) {
      logger.debug("Skipping duplicate standalone submission");
      return;
    }

    this.lastStandaloneSubmission = Date.now();
    const fields = this.extractAllVisibleFieldOpids();
    logger.debug(`Standalone submission detected with ${fields.size} fields`);
    await this.notifyCallbacks(fields);
  }

  private isDuplicateSubmission(key: HTMLFormElement | "standalone"): boolean {
    const lastSubmission =
      key === "standalone"
        ? this.lastStandaloneSubmission
        : this.recentFormSubmissions.get(key);

    if (!lastSubmission) return false;

    return Date.now() - lastSubmission < SUBMISSION_DEBOUNCE_MS;
  }

  private extractFieldOpids(form: HTMLFormElement): Set<FieldOpId> {
    const opids = new Set<FieldOpId>();

    const fields = form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select");

    for (const field of fields) {
      const opid = field.getAttribute("data-superfill-opid");
      if (opid) {
        opids.add(opid as FieldOpId);
      }
    }

    return opids;
  }

  private extractAllVisibleFieldOpids(): Set<FieldOpId> {
    const opids = new Set<FieldOpId>();

    const fields = document.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select");

    for (const field of fields) {
      if (field.offsetParent === null) continue; // Skip invisible fields

      const opid = field.getAttribute("data-superfill-opid");
      if (opid) {
        opids.add(opid as FieldOpId);
      }
    }

    return opids;
  }

  private async notifyCallbacks(fields: Set<FieldOpId>): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const callback of this.submissionCallbacks) {
      try {
        const result = callback(fields);
        if (result instanceof Promise) {
          promises.push(
            result.catch((error) => {
              logger.error("Submission callback error:", error);
            }),
          );
        }
      } catch (error) {
        logger.error("Submission callback error:", error);
      }
    }

    await Promise.all(promises);
  }

  private startMutationObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLFormElement) {
            this.attachFormListener(node);
          } else if (node instanceof HTMLElement) {
            const forms = node.querySelectorAll<HTMLFormElement>("form");
            for (const form of forms) {
              this.attachFormListener(form);
            }

            if (this.isSubmitButton(node)) {
              this.attachButtonListener(
                node as HTMLButtonElement | HTMLInputElement,
              );
            } else {
              const buttons = node.querySelectorAll<
                HTMLButtonElement | HTMLInputElement
              >("button, input[type='button'], input[type='submit']");

              for (const button of buttons) {
                if (this.isSubmitButton(button)) {
                  this.attachButtonListener(button);
                }
              }
            }
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private removeAllListeners(): void {
    for (const cleanup of this.formListeners.values()) {
      cleanup();
    }
    this.formListeners.clear();

    for (const [button, listener] of this.buttonListeners.entries()) {
      button.removeEventListener("click", listener);
    }
    this.buttonListeners.clear();
  }
}

let monitorInstance: FormSubmissionMonitor | null = null;

export function getFormSubmissionMonitor(): FormSubmissionMonitor {
  if (!monitorInstance) {
    monitorInstance = new FormSubmissionMonitor();
  }
  return monitorInstance;
}
