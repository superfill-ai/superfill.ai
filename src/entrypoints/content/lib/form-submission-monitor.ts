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

const DUPLICATE_SUBMISSION_THRESHOLD_MS = 1000;
const FORM_SUBMISSION_TIMEOUT_MS = 1500;

export class FormSubmissionMonitor {
  private submissionCallbacks: Set<SubmissionCallback> = new Set();
  private buttonListeners: Map<
    HTMLButtonElement | HTMLInputElement,
    () => void
  > = new Map();
  private recentFormSubmissions: WeakMap<HTMLFormElement, number> =
    new WeakMap();
  private lastStandaloneSubmission: number = 0;
  private isMonitoring = false;
  private observer: MutationObserver | null = null;
  private lastUrl: string = window.location.href;
  private pendingSubmissionTimeout: number | null = null;
  private trackedFields = new Set<FieldOpId>();
  private formFieldsMap = new WeakMap<HTMLFormElement, Set<FieldOpId>>();
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;
  private boundPopStateListener: (() => void) | null = null;

  start(): void {
    if (this.isMonitoring) {
      logger.warn("Form submission monitor already started");
      return;
    }

    this.attachSubmitButtonListeners();
    this.startMutationObserver();
    this.startUrlChangeDetection();
    this.isMonitoring = true;

    logger.info("Form submission monitor started");
  }

  dispose(): void {
    if (!this.isMonitoring) return;

    this.removeAllListeners();
    this.submissionCallbacks.clear();

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.pendingSubmissionTimeout) {
      window.clearTimeout(this.pendingSubmissionTimeout);
      this.pendingSubmissionTimeout = null;
    }

    if (this.boundPopStateListener) {
      window.removeEventListener("popstate", this.boundPopStateListener);
      this.boundPopStateListener = null;
    }

    if (this.originalPushState) {
      history.pushState = this.originalPushState;
      this.originalPushState = null;
    }

    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }

    this.isMonitoring = false;
    logger.info("Form submission monitor stopped");
  }

  onSubmission(callback: SubmissionCallback): () => void {
    this.submissionCallbacks.add(callback);
    return () => {
      this.submissionCallbacks.delete(callback);
    };
  }

  registerFields(
    fields: Array<{
      opid: FieldOpId;
      element: HTMLElement;
      formElement: HTMLFormElement | null;
    }>,
  ): void {
    for (const field of fields) {
      this.trackedFields.add(field.opid);

      if (field.formElement) {
        if (!this.formFieldsMap.has(field.formElement)) {
          this.formFieldsMap.set(field.formElement, new Set());
        }
        this.formFieldsMap.get(field.formElement)?.add(field.opid);
      }
    }
    logger.info(`Registered ${fields.length} tracked fields`);
  }

  private attachSubmitButtonListeners(): void {
    const buttons = this.findSubmitButtons();

    for (const button of buttons) {
      this.attachButtonListener(button);
    }

    logger.info(`Attached listeners to ${buttons.length} submit buttons`);
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

    const listener = () => {
      logger.info("Submit button clicked", button);

      this.scheduleSubmissionTimeout();

      const form = button.closest("form");
      const handleCompletion = () => {
        this.clearPendingSubmissionTimeout();
      };

      if (form) {
        this.handleFormSubmission(form)
          .then(handleCompletion)
          .catch((error) => {
            logger.error("handleFormSubmission error:", error);
            handleCompletion();
          });
      } else {
        this.handleStandaloneSubmission()
          .then(handleCompletion)
          .catch((error) => {
            logger.error("handleStandaloneSubmission error:", error);
            handleCompletion();
          });
      }
    };

    button.addEventListener("click", listener, { passive: true });
    this.buttonListeners.set(button, listener);
  }

  private async handleFormSubmission(form: HTMLFormElement): Promise<void> {
    if (this.isDuplicateSubmission(form)) {
      logger.info("Skipping duplicate form submission");
      return;
    }

    this.recentFormSubmissions.set(form, Date.now());
    const fields = this.extractFieldOpids(form);
    logger.info(`Form submission detected with ${fields.size} fields`);
    await this.notifyCallbacks(fields);
  }

  private async handleStandaloneSubmission(): Promise<void> {
    if (this.isDuplicateSubmission("standalone")) {
      logger.info("Skipping duplicate standalone submission");
      return;
    }

    this.lastStandaloneSubmission = Date.now();
    const fields = this.extractAllVisibleFieldOpids();
    logger.info(`Standalone submission detected with ${fields.size} fields`);
    await this.notifyCallbacks(fields);
  }

  private isDuplicateSubmission(key: HTMLFormElement | "standalone"): boolean {
    const lastSubmission =
      key === "standalone"
        ? this.lastStandaloneSubmission
        : this.recentFormSubmissions.get(key);

    if (!lastSubmission) return false;

    return Date.now() - lastSubmission < DUPLICATE_SUBMISSION_THRESHOLD_MS;
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
    return new Set(this.trackedFields);
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
          if (node instanceof HTMLElement) {
            if (
              (node instanceof HTMLButtonElement ||
                node instanceof HTMLInputElement) &&
              this.isSubmitButton(node)
            ) {
              this.attachButtonListener(node);
            }

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
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private removeAllListeners(): void {
    for (const [button, listener] of this.buttonListeners.entries()) {
      button.removeEventListener("click", listener);
    }
    this.buttonListeners.clear();
  }

  private startUrlChangeDetection(): void {
    this.boundPopStateListener = () => {
      this.handleUrlChange();
    };
    window.addEventListener("popstate", this.boundPopStateListener);

    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      if (this.originalPushState) {
        this.originalPushState.apply(history, args);
      }
      this.handleUrlChange();
    };

    history.replaceState = (...args) => {
      if (this.originalReplaceState) {
        this.originalReplaceState.apply(history, args);
      }
      this.handleUrlChange();
    };

    logger.info("URL change detection started");
  }

  private handleUrlChange(): void {
    const newUrl = window.location.href;

    if (newUrl !== this.lastUrl) {
      logger.info("URL changed, checking for pending submission", {
        from: this.lastUrl,
        to: newUrl,
      });

      this.lastUrl = newUrl;

      if (this.pendingSubmissionTimeout) {
        this.triggerPendingSubmission();
      }
    }
  }

  private scheduleSubmissionTimeout(): void {
    if (this.pendingSubmissionTimeout) {
      window.clearTimeout(this.pendingSubmissionTimeout);
    }

    this.pendingSubmissionTimeout = window.setTimeout(() => {
      logger.info("Submission timeout triggered");
      this.triggerPendingSubmission();
    }, FORM_SUBMISSION_TIMEOUT_MS);
  }

  private clearPendingSubmissionTimeout(): void {
    if (this.pendingSubmissionTimeout) {
      window.clearTimeout(this.pendingSubmissionTimeout);
      this.pendingSubmissionTimeout = null;
    }
  }

  private async triggerPendingSubmission(): Promise<void> {
    if (this.pendingSubmissionTimeout) {
      window.clearTimeout(this.pendingSubmissionTimeout);
      this.pendingSubmissionTimeout = null;
    }

    try {
      await this.handleStandaloneSubmission();
    } catch (error) {
      logger.error("Error in triggerPendingSubmission:", error);
    }
  }
}

let monitorInstance: FormSubmissionMonitor | null = null;

export function getFormSubmissionMonitor(): FormSubmissionMonitor {
  if (!monitorInstance) {
    monitorInstance = new FormSubmissionMonitor();
  }
  return monitorInstance;
}
