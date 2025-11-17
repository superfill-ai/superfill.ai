import { defineProxyService } from "@webext-core/proxy-service";
import { createLogger } from "@/lib/logger";
import { addFormMapping } from "@/lib/storage/form-mappings";
import {
  completeSession,
  startSession,
  updateSession,
} from "@/lib/storage/sessions";
import { useMemoriesStore } from "@/lib/stores/memories";
import type { FillSession, FormMapping } from "@/types/memory";

const logger = createLogger("session-service");

class SessionService {
  async startSession(): Promise<FillSession> {
    try {
      const session = await startSession();
      logger.info("Session started:", session.id);
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
      logger.info("Session status updated:", sessionId, status);
      return true;
    } catch (error) {
      logger.error("Failed to update session status:", error);
      return false;
    }
  }

  async completeSession(sessionId: string): Promise<boolean> {
    try {
      await completeSession(sessionId);
      logger.info("Session completed:", sessionId);
      return true;
    } catch (error) {
      logger.error("Failed to complete session:", error);
      return false;
    }
  }

  async incrementMemoryUsage(memoryIds: string[]): Promise<boolean> {
    try {
      const store = useMemoriesStore.getState();

      for (const memoryId of memoryIds) {
        await store.incrementUsageCount(memoryId);
      }
      logger.info("Memory usage incremented for:", memoryIds);
      return true;
    } catch (error) {
      logger.error("Failed to increment memory usage:", error);
      return false;
    }
  }

  async saveFormMappings(
    sessionId: string,
    formMappings: FormMapping[],
  ): Promise<boolean> {
    try {
      for (const formMapping of formMappings) {
        await addFormMapping(formMapping);
      }

      await updateSession(sessionId, {
        formMappings,
      });

      logger.info(
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
