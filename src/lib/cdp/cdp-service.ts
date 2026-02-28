import { createLogger } from "@/lib/logger";

const logger = createLogger("cdp-service");

const CDP_VERSION = "1.3";

interface DebuggerTarget {
  tabId?: number;
}

type ChromeDebugger = {
  attach: (target: DebuggerTarget, version: string) => Promise<void>;
  detach: (target: DebuggerTarget) => Promise<void>;
  sendCommand: (
    target: DebuggerTarget,
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
  onDetach: {
    addListener: (
      callback: (source: DebuggerTarget, reason: string) => void,
    ) => void;
  };
};

function getChromeDebugger(): ChromeDebugger {
  const g = globalThis as unknown as { chrome?: { debugger?: ChromeDebugger } };
  if (!g.chrome?.debugger) throw new Error("chrome.debugger API unavailable");
  return g.chrome.debugger;
}

const attachedTabs = new Map<number, boolean>();

export async function attachToTab(tabId: number): Promise<void> {
  if (attachedTabs.get(tabId)) {
    logger.debug(`Already attached to tab ${tabId}`);
    return;
  }

  const dbg = getChromeDebugger();
  await dbg.attach({ tabId }, CDP_VERSION);
  attachedTabs.set(tabId, true);
  logger.info(`Attached to tab ${tabId}`);

  await Promise.all([
    sendCommand(tabId, "Accessibility.enable"),
    sendCommand(tabId, "DOM.enable"),
    sendCommand(tabId, "Page.enable"),
  ]);
}

export async function detachFromTab(tabId: number): Promise<void> {
  if (!attachedTabs.get(tabId)) return;

  try {
    const dbg = getChromeDebugger();
    await dbg.detach({ tabId });
  } catch {
    // Already detached (tab closed, etc.)
  }
  attachedTabs.delete(tabId);
  logger.info(`Detached from tab ${tabId}`);
}

export async function sendCommand<T = unknown>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const dbg = getChromeDebugger();
  const result = await dbg.sendCommand({ tabId }, method, params);
  return result as T;
}

export function isAttached(tabId: number): boolean {
  return attachedTabs.get(tabId) === true;
}

export function isCDPSupported(): boolean {
  try {
    getChromeDebugger();
    return true;
  } catch {
    return false;
  }
}

// Clean up state when debugger detaches externally (e.g. user clicks "cancel")
try {
  getChromeDebugger().onDetach.addListener((source) => {
    if (source.tabId) {
      attachedTabs.delete(source.tabId);
      logger.info(`Debugger externally detached from tab ${source.tabId}`);
    }
  });
} catch {
  // Not in a Chrome environment (Firefox, tests, etc.)
}
