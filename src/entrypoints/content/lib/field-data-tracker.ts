import { TRACKABLE_FIELD_TYPES } from "@/lib/copies";
import { createLogger } from "@/lib/logger";
import type {
  CaptureSession,
  DetectedFieldSnapshot,
  FieldMapping,
  FieldOpId,
  TrackedFieldData,
} from "@/types/autofill";

const logger = createLogger("field-data-tracker");

const STORAGE_KEY = "local:capture:session";
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export class FieldDataTracker {
  private session: CaptureSession | null = null;
  private activeListeners = new Map<FieldOpId, () => void>();
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadSession();
    this.startCleanupTimer();
  }

  async startTracking(
    url: string,
    pageTitle: string,
    sessionId: string,
  ): Promise<void> {
    // If we already have a session for this URL, keep it to preserve tracked fields
    if (this.session && this.session.url === url) {
      logger.info("Reusing existing tracking session for URL:", url);
      return;
    }

    this.session = {
      sessionId,
      url,
      pageTitle,
      trackedFields: new Map(),
      startedAt: Date.now(),
    };

    await this.saveSession();
    logger.info("Started tracking session:", sessionId);
  }

  attachFieldListeners(
    fields: DetectedFieldSnapshot[],
    mappings: Map<FieldOpId, FieldMapping>,
  ): void {
    if (!this.session) {
      logger.warn("No active session, skipping field listener attachment");
      return;
    }

    let attachedCount = 0;
    for (const field of fields) {
      if (!this.isTrackableField(field)) continue;

      // Skip if we already have a listener for this field
      if (this.activeListeners.has(field.opid)) continue;

      const element = this.findFieldElement(field.opid);
      if (!element) {
        logger.debug(`Could not find element for field ${field.opid}`);
        continue;
      }

      const mapping = mappings.get(field.opid);
      const listener = () => this.handleFieldBlur(field, mapping, element);

      element.addEventListener("blur", listener);
      this.activeListeners.set(field.opid, () => {
        element.removeEventListener("blur", listener);
      });
      attachedCount++;
    }

    logger.info(
      `Attached ${attachedCount} new listeners (total: ${this.activeListeners.size} fields)`,
    );
  }

  private isTrackableField(field: DetectedFieldSnapshot): boolean {
    const type = field.metadata.fieldType;

    if (type === "password") return false;

    // @ts-expect-error: Dynamic check against allowed types
    return TRACKABLE_FIELD_TYPES.includes(type);
  }

  private findFieldElement(
    opid: FieldOpId,
  ): HTMLInputElement | HTMLTextAreaElement | null {
    const selector = `input[data-superfill-opid="${opid}"], textarea[data-superfill-opid="${opid}"]`;

    return document.querySelector(selector);
  }

  private async handleFieldBlur(
    field: DetectedFieldSnapshot,
    mapping: FieldMapping | undefined,
    element: HTMLInputElement | HTMLTextAreaElement,
  ): Promise<void> {
    if (!this.session) return;

    const value = element.value.trim();

    if (!value) return;

    const wasAIFilled =
      element.getAttribute("data-superfill-filled") === "true";
    const originalAIValue = element.getAttribute("data-superfill-original");
    const aiMemoryId = element.getAttribute("data-superfill-memoryid");

    const trackedData: TrackedFieldData = {
      fieldOpid: field.opid,
      formOpid: field.formOpid,
      value,
      timestamp: Date.now(),
      wasAIFilled,
      originalAIValue: originalAIValue || undefined,
      aiMemoryId: aiMemoryId || undefined,
      aiConfidence: mapping?.confidence,
      metadata: field.metadata,
    };

    this.session.trackedFields.set(field.opid, trackedData);
    await this.saveSession();

    logger.debug(`Tracked field ${field.opid}:`, {
      value: value.substring(0, 20),
      wasAIFilled,
    });
  }

  async getCapturedFields(): Promise<TrackedFieldData[]> {
    const session = await this.getSession();

    if (!session) return [];

    return Array.from(session.trackedFields.values());
  }

  async getSession(): Promise<CaptureSession | null> {
    if (this.session) return this.session;

    await this.loadSession();

    return this.session;
  }

  async clearSession(): Promise<void> {
    this.removeAllListeners();
    this.session = null;

    await browser.storage.local.remove(STORAGE_KEY);
    logger.info("Cleared capture session");
  }

  dispose(): void {
    this.removeAllListeners();

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private removeAllListeners(): void {
    for (const cleanup of this.activeListeners.values()) {
      cleanup();
    }
    this.activeListeners.clear();
  }

  private async saveSession(): Promise<void> {
    if (!this.session) return;

    const serialized = {
      sessionId: this.session.sessionId,
      url: this.session.url,
      pageTitle: this.session.pageTitle,
      trackedFields: Array.from(this.session.trackedFields.entries()),
      startedAt: this.session.startedAt,
    };

    await browser.storage.local.set({ [STORAGE_KEY]: serialized });
  }

  private async loadSession(): Promise<void> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY];

      if (!stored) {
        this.session = null;
        return;
      }

      const age = Date.now() - stored.startedAt;
      if (age > SESSION_TIMEOUT) {
        logger.info("Session expired, clearing");
        await browser.storage.local.remove(STORAGE_KEY);
        this.session = null;
        return;
      }

      this.session = {
        sessionId: stored.sessionId,
        url: stored.url,
        pageTitle: stored.pageTitle,
        trackedFields: new Map(stored.trackedFields),
        startedAt: stored.startedAt,
      };

      logger.info("Loaded existing session:", this.session.sessionId);
    } catch (error) {
      logger.error("Failed to load session:", error);
      this.session = null;
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(
      () => {
        this.checkSessionExpiry();
      },
      5 * 60 * 1000,
    );
  }

  private async checkSessionExpiry(): Promise<void> {
    if (!this.session) return;

    const age = Date.now() - this.session.startedAt;
    if (age > SESSION_TIMEOUT) {
      logger.info("Session expired during cleanup check");
      await this.clearSession();
    }
  }
}

let trackerInstance: FieldDataTracker | null = null;

export function getFieldDataTracker(): FieldDataTracker {
  if (!trackerInstance) {
    trackerInstance = new FieldDataTracker();
  }
  return trackerInstance;
}
