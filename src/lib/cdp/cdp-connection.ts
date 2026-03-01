import { createLogger } from "@/lib/logger";

const logger = createLogger("cdp-connection");

/**
 * Chrome debugger API types (not provided by WXT/webextension-polyfill).
 * The chrome.debugger API is Chrome-specific and used for CDP access.
 */
interface ChromeDebuggerDebuggee {
  tabId?: number;
  extensionId?: string;
  targetId?: string;
}

type DetachListener = (source: ChromeDebuggerDebuggee, reason: string) => void;

/** Access the chrome.debugger API (available in MV3 background service worker) */
const chromeDebugger = (
  globalThis as unknown as {
    chrome: {
      debugger: {
        attach: (
          target: ChromeDebuggerDebuggee,
          requiredVersion: string,
        ) => Promise<void>;
        detach: (target: ChromeDebuggerDebuggee) => Promise<void>;
        sendCommand: (
          target: ChromeDebuggerDebuggee,
          method: string,
          commandParams?: Record<string, unknown>,
        ) => Promise<unknown>;
        onDetach: {
          addListener: (callback: DetachListener) => void;
          removeListener: (callback: DetachListener) => void;
        };
      };
    };
  }
).chrome.debugger;

/**
 * Manages Chrome DevTools Protocol connections via chrome.debugger API.
 * Handles attaching/detaching and provides a typed command interface.
 */
export class CDPConnection {
  private tabId: number;
  private attached = false;
  private detachListenerBound: DetachListener;
  private onDetachCallback?: () => void;

  constructor(tabId: number) {
    this.tabId = tabId;
    this.detachListenerBound = this.handleDetach.bind(this);
  }

  get isAttached(): boolean {
    return this.attached;
  }

  get targetTabId(): number {
    return this.tabId;
  }

  async attach(): Promise<void> {
    if (this.attached) {
      logger.warn("Already attached to tab", this.tabId);
      return;
    }

    try {
      await chromeDebugger.attach({ tabId: this.tabId }, "1.3");
      this.attached = true;

      chromeDebugger.onDetach.addListener(this.detachListenerBound);

      logger.info("CDP attached to tab", this.tabId);
    } catch (error) {
      logger.error("Failed to attach CDP to tab", this.tabId, error);
      throw new Error(
        `Failed to attach debugger: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async detach(): Promise<void> {
    if (!this.attached) {
      return;
    }

    try {
      chromeDebugger.onDetach.removeListener(this.detachListenerBound);
      await chromeDebugger.detach({ tabId: this.tabId });
      this.attached = false;
      logger.info("CDP detached from tab", this.tabId);
    } catch (error) {
      logger.warn("Error detaching CDP (tab may already be closed):", error);
      this.attached = false;
    }
  }

  onDetach(callback: () => void): void {
    this.onDetachCallback = callback;
  }

  /**
   * Send a CDP command and return the result.
   * Type-safe wrapper around chrome.debugger.sendCommand.
   */
  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.attached) {
      throw new Error("CDP not attached. Call attach() first.");
    }

    try {
      const result = await chromeDebugger.sendCommand(
        { tabId: this.tabId },
        method,
        params,
      );
      return result as T;
    } catch (error) {
      logger.error(`CDP command failed: ${method}`, error);
      throw new Error(
        `CDP command '${method}' failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Enable a CDP domain (e.g., "DOM", "Page", "Runtime", "Input").
   */
  async enableDomain(domain: string): Promise<void> {
    await this.send(`${domain}.enable`);
    logger.info(`CDP domain enabled: ${domain}`);
  }

  /**
   * Disable a CDP domain.
   */
  async disableDomain(domain: string): Promise<void> {
    try {
      await this.send(`${domain}.disable`);
    } catch {
      // Ignore errors when disabling (domain may not have been enabled)
    }
  }

  /**
   * Initialize all domains needed for the agent loop.
   */
  async initializeForAgentLoop(): Promise<void> {
    await Promise.all([
      this.enableDomain("DOM"),
      this.enableDomain("Page"),
      this.enableDomain("Runtime"),
      this.enableDomain("Input"),
      this.enableDomain("Overlay"),
    ]);

    logger.info("CDP domains initialized for agent loop");
  }

  /**
   * Clean up domains before detaching.
   */
  async cleanupDomains(): Promise<void> {
    await Promise.all([
      this.disableDomain("Overlay"),
      this.disableDomain("Input"),
      this.disableDomain("Runtime"),
      this.disableDomain("Page"),
      this.disableDomain("DOM"),
    ]);
  }

  private handleDetach(source: ChromeDebuggerDebuggee, reason: string): void {
    if (source.tabId === this.tabId) {
      logger.warn("CDP detached externally, reason:", reason);
      this.attached = false;
      chromeDebugger.onDetach.removeListener(this.detachListenerBound);
      this.onDetachCallback?.();
    }
  }
}
