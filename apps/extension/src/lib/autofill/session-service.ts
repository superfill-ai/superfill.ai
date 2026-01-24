import { createLogger } from "@superfill/shared/logger";
import type { FillSession, FormMapping } from "@superfill/shared/types/memory";
import { defineProxyService } from "@webext-core/proxy-service";
import {
  completeSession,
  startSession,
  updateSession,
} from "@/lib/storage/sessions";

const logger = createLogger("session-service");

class SessionService {
  async startSession(): Promise<FillSession> {
    try {
      const session = await startSession();
      logger.debug("Session started:", session.id);
      return session;
    } catch (error) {
      logger.error("Failed to start session:", error);
      throw error;
    }
  }

  async updateSessionStatus(
    sessionId: string,
    status: FillSession["status"],
  ): Promise<boolean> {
    try {
      await updateSession(sessionId, { status });
      logger.debug("Session status updated:", sessionId, status);
      return true;
    } catch (error) {
      logger.error("Failed to update session status:", error);
      return false;
    }
  }

  async completeSession(sessionId: string): Promise<boolean> {
    try {
      await completeSession(sessionId);
      logger.debug("Session completed:", sessionId);
      return true;
    } catch (error) {
      logger.error("Failed to complete session:", error);
      return false;
    }
  }

  async saveFormMappings(
    sessionId: string,
    formMappings: FormMapping[],
  ): Promise<boolean> {
    try {
      await updateSession(sessionId, {
        formMappings,
      });

      logger.debug(
        "Form mappings saved for session:",
        sessionId,
        formMappings.length,
      );
      return true;
    } catch (error) {
      logger.error("Failed to save form mappings:", error);
      return false;
    }
  }
}

export const [registerSessionService, getSessionService] = defineProxyService(
  "SessionService",
  () => new SessionService(),
);
