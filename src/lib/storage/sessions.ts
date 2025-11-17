import { v7 as uuidv7 } from "uuid";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { FillSession } from "@/types/memory";

const logger = createLogger("sessions");

export const startSession = async (): Promise<FillSession> => {
  try {
    const newSession: FillSession = {
      id: uuidv7(),
      formMappings: [],
      status: "detecting",
      startedAt: new Date().toISOString(),
    };

    const currentSessions = await storage.fillSessions.getValue();
    const updatedSessions = [...currentSessions, newSession];

    await storage.fillSessions.setValue(updatedSessions);

    return newSession;
  } catch (error) {
    logger.error("Failed to start session:", error);
    throw error;
  }
};

export const updateSession = async (
  id: string,
  updates: Partial<FillSession>,
): Promise<void> => {
  try {
    const currentSessions = await storage.fillSessions.getValue();
    const session = currentSessions.find((s) => s.id === id);

    if (!session) {
      throw new Error(`Session with id ${id} not found`);
    }

    const updatedSession: FillSession = {
      ...session,
      ...updates,
    };

    const updatedSessions = currentSessions.map((s) =>
      s.id === id ? updatedSession : s,
    );

    await storage.fillSessions.setValue(updatedSessions);
  } catch (error) {
    logger.error("Failed to update session:", error);
    throw error;
  }
};

export const completeSession = async (id: string): Promise<void> => {
  try {
    const currentSessions = await storage.fillSessions.getValue();
    const session = currentSessions.find((s) => s.id === id);

    if (!session) {
      throw new Error(`Session with id ${id} not found`);
    }

    const completedSession: FillSession = {
      ...session,
      status: "completed",
      completedAt: new Date().toISOString(),
    };

    const updatedSessions = currentSessions.map((s) =>
      s.id === id ? completedSession : s,
    );

    await storage.fillSessions.setValue(updatedSessions);
  } catch (error) {
    logger.error("Failed to complete session:", error);
    throw error;
  }
};

export const failSession = async (
  id: string,
  errorMsg: string,
): Promise<void> => {
  try {
    const currentSessions = await storage.fillSessions.getValue();
    const session = currentSessions.find((s) => s.id === id);

    if (!session) {
      throw new Error(`Session with id ${id} not found`);
    }

    const failedSession: FillSession = {
      ...session,
      status: "failed",
      error: errorMsg,
      completedAt: new Date().toISOString(),
    };

    const updatedSessions = currentSessions.map((s) =>
      s.id === id ? failedSession : s,
    );

    await storage.fillSessions.setValue(updatedSessions);
  } catch (error) {
    logger.error("Failed to fail session:", error);
    throw error;
  }
};

export const getSessionById = async (
  id: string,
): Promise<FillSession | undefined> => {
  const sessions = await storage.fillSessions.getValue();
  return sessions.find((s) => s.id === id);
};

export const getRecentSessions = async (limit = 10): Promise<FillSession[]> => {
  const sessions = await storage.fillSessions.getValue();
  return sessions
    .slice()
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    .slice(0, limit);
};
