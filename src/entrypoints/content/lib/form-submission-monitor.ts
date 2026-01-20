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

// TODO: Re-enable webRequest integration when properly scoped
// interface WebRequestSubmissionMessage {
//   type: "FORM_SUBMITTED_VIA_WEBREQUEST";
//   url: string;
//   method: string;
//   timestamp: number;
// }

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
  // TODO: Re-enable when webRequest is properly implemented
  // private hasWebRequestAPI = false;
  // private webRequestListener:
  //   | ((message: WebRequestSubmissionMessage) => void)
  //   | null = null;
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;
  private boundPopStateListener: (() => void) | null = null;

  start(): void {
    if (this.isMonitoring) {
      logger.warn("Form submission monitor already started");
      return;
    }

    // TODO: Re-enable webRequest integration when properly scoped
    // this.webRequestListener = (message: WebRequestSubmissionMessage) => {
    //   if (message.type === "FORM_SUBMITTED_VIA_WEBREQUEST") {
    //     logger.debug(
    //       "Received webRequest submission notification:",
    //       message.url,
    //       message.method,
    //     );
    //     if (!this.hasWebRequestAPI) {
    //       this.hasWebRequestAPI = true;
    //       logger.debug(
    //         "webRequest API confirmed working via background script",
    //       );
    //     }
    //
    //     if (this.pendingSubmissionTimeout) {
    //       window.clearTimeout(this.pendingSubmissionTimeout);
    //       this.pendingSubmissionTimeout = null;
    //       logger.debug("Cancelled pending timeout - webRequest took priority");
    //     }
    //     this.triggerPendingSubmission();
    //   }
    // };
    //
    // browser.runtime.onMessage.addListener(this.webRequestListener);

    this.attachSubmitButtonListeners();
    this.startMutationObserver();
    this.startUrlChangeDetection();
    this.isMonitoring = true;

    logger.debug("Form submission monitor started");
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

    // TODO: Re-enable when webRequest is properly implemented
    // if (this.webRequestListener) {
    //   browser.runtime.onMessage.removeListener(this.webRequestListener);
    //   this.webRequestListener = null;
    // }

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
    logger.debug("Form submission monitor stopped");
  }

  onSubmission(callback: SubmissionCallback): () => void {
    this.submissionCallbacks.add(callback);
    return () => {
      this.submissionCallbacks.delete(callback);
    };
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

    const listener = () => {
      logger.debug("Submit button clicked", button);

      this.scheduleSubmissionTimeout();

      const form = button.closest("form");
      if (form) {
        this.handleFormSubmission(form);
      } else {
        this.handleStandaloneSubmission();
      }
    };

    button.addEventListener("click", listener, { passive: true });
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
    const opids = new Set<FieldOpId>();

    const fields = document.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select");

    for (const field of fields) {
      if (!field.checkVisibility()) continue;

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

    logger.debug("URL change detection started");
  }

  private handleUrlChange(): void {
    const newUrl = window.location.href;

    if (newUrl !== this.lastUrl) {
      logger.debug("URL changed, checking for pending submission", {
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
      logger.debug("Submission timeout triggered");
      this.triggerPendingSubmission();
    }, FORM_SUBMISSION_TIMEOUT_MS);
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
