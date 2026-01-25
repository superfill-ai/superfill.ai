import { isTrackableFieldType } from "@/lib/copies";
import { createLogger } from "@/lib/logger";
import type {
  CaptureSession,
  DetectedFieldSnapshot,
  FieldMapping,
  FieldOpId,
  FormFieldElement,
  TrackedFieldData,
} from "@/types/autofill";

const logger = createLogger("field-data-tracker");

const STORAGE_KEY = "local:capture:session";
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export class FieldDataTracker {
  private session: CaptureSession | null = null;
  private activeListeners = new Map<FieldOpId, () => void>();
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;
  private aiFilledFields = new Map<
    FieldOpId,
    { value: string; confidence?: number }
  >();

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadSession();
    this.startCleanupTimer();
    this.initialized = true;
  }

  async startTracking(
    url: string,
    pageTitle: string,
    sessionId: string,
  ): Promise<void> {
    if (this.session && this.session.url === url) {
      logger.debug("Reusing existing tracking session for URL:", url);
      return;
    }

    const existingTrackedFields =
      this.session?.url === url ? this.session.trackedFields : new Map();

    this.session = {
      sessionId,
      url,
      pageTitle,
      trackedFields: existingTrackedFields,
      startedAt: Date.now(),
    };

    await this.saveSession();
    logger.debug("Started tracking session:", sessionId, {
      preservedFields: existingTrackedFields.size,
    });
  }

  attachFieldListeners(
    fields: DetectedFieldSnapshot[],
    mappings: Map<FieldOpId, FieldMapping>,
    fieldCache: Map<FieldOpId, { element: FormFieldElement }>,
  ): void {
    if (!this.session) {
      logger.warn("No active session, skipping field listener attachment");
      return;
    }

    let attachedCount = 0;
    for (const field of fields) {
      if (!this.isTrackableField(field)) continue;
      if (this.activeListeners.has(field.opid)) continue;

      const cachedField = fieldCache.get(field.opid);
      if (!cachedField) {
        logger.debug(`Field ${field.opid} not in cache`);
        continue;
      }
      const element = cachedField.element;

      const mapping = mappings.get(field.opid);
      const listener = () => this.handleFieldBlur(field, mapping, element);

      element.addEventListener("blur", listener);
      this.activeListeners.set(field.opid, () => {
        element.removeEventListener("blur", listener);
      });
      attachedCount++;
    }

    logger.debug(
      `Attached ${attachedCount} new listeners (total: ${this.activeListeners.size} fields)`,
    );
  }

  private isTrackableField(field: DetectedFieldSnapshot): boolean {
    const type = field.metadata.fieldType;

    if (type === "password") return false;

    return isTrackableFieldType(type);
  }

  private async handleFieldBlur(
    field: DetectedFieldSnapshot,
    mapping: FieldMapping | undefined,
    element: FormFieldElement,
  ): Promise<void> {
    if (!this.session) return;

    const value = element.value.trim();

    if (!value) return;

    const aiFilledData = this.aiFilledFields.get(field.opid);
    const wasAIFilled = !!aiFilledData;
    const originalAIValue = aiFilledData?.value;

    const trackedData: TrackedFieldData = {
      fieldOpid: field.opid,
      formOpid: field.formOpid,
      value,
      timestamp: Date.now(),
      wasAIFilled,
      originalAIValue: originalAIValue || undefined,
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

  markFieldAsAIFilled(
    opid: FieldOpId,
    value: string,
    confidence?: number,
  ): void {
    if (confidence !== undefined) {
      if (typeof confidence !== "number" || Number.isNaN(confidence)) {
        logger.warn(
          `Invalid confidence value for field ${opid}: ${confidence}. Using undefined.`,
        );
        confidence = undefined;
      } else if (confidence < 0 || confidence > 1) {
        const clamped = Math.max(0, Math.min(1, confidence));
        logger.warn(
          `Confidence value ${confidence} for field ${opid} is out of range [0,1]. Clamping to ${clamped}.`,
        );
        confidence = clamped;
      }
    }

    this.aiFilledFields.set(opid, { value, confidence });
  }

  async clearSession(): Promise<void> {
    this.removeAllListeners();
    this.session = null;
    this.aiFilledFields.clear();

    await browser.storage.local.remove(STORAGE_KEY);
    logger.debug("Cleared capture session");
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
      const stored = result[STORAGE_KEY] as
        | {
            sessionId: string;
            url: string;
            pageTitle: string;
            trackedFields: [FieldOpId, TrackedFieldData][];
            startedAt: number;
          }
        | undefined;

      if (!stored) {
        this.session = null;
        return;
      }

      const age = Date.now() - stored.startedAt;
      if (age > SESSION_TIMEOUT) {
        logger.debug("Session expired, clearing");
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

      logger.debug("Loaded existing session:", this.session.sessionId);
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
      logger.debug("Session expired during cleanup check");
      await this.clearSession();
    }
  }
}

let trackerInstance: FieldDataTracker | null = null;
let initPromise: Promise<FieldDataTracker> | null = null;

export async function getFieldDataTracker(): Promise<FieldDataTracker> {
  if (trackerInstance) {
    return trackerInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      trackerInstance = new FieldDataTracker();
      await trackerInstance.initialize();
      return trackerInstance;
    })();
  }

  return initPromise;
}
