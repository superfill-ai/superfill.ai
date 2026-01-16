import type { RxDatabase } from "rxdb";
import { v7 as uuidv7 } from "uuid";
import { createLogger } from "@/lib/logger";
import type { MemoryEntry } from "@/types/memory";
import type { DatabaseCollections, MemoryDocType } from "./schemas";

const logger = createLogger("rxdb:migration");

const MIGRATION_KEY = "rxdb_migration_completed";

/**
 * Check if migration from WXT storage has been completed
 */
export async function isMigrationCompleted(): Promise<boolean> {
  const result = await browser.storage.local.get(MIGRATION_KEY);
  return result[MIGRATION_KEY] === true;
}

/**
 * Mark migration as completed
 */
async function markMigrationCompleted(): Promise<void> {
  await browser.storage.local.set({ [MIGRATION_KEY]: true });
}

/**
 * Migrate memories from WXT storage to RxDB
 */
export async function migrateFromWxtStorage(
  db: RxDatabase<DatabaseCollections>,
): Promise<number> {
  if (await isMigrationCompleted()) {
    logger.info("Migration already completed, skipping");
    return 0;
  }

  logger.info("Starting migration from WXT storage to RxDB");

  try {
    // Get existing memories from WXT storage
    const result = await browser.storage.local.get("local:data:memories");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldMemories: MemoryEntry[] =
      (result as any)["local:data:memories"] || [];

    if (oldMemories.length === 0) {
      logger.info("No memories to migrate");
      await markMigrationCompleted();
      return 0;
    }

    logger.info(`Found ${oldMemories.length} memories to migrate`);

    // Transform to RxDB format
    const rxdbDocs: MemoryDocType[] = oldMemories.map((memory) => ({
      id: memory.id || uuidv7(),
      syncId: memory.syncId,
      question: memory.question,
      answer: memory.answer,
      category: memory.category,
      tags: memory.tags,
      confidence: memory.confidence,
      embedding: memory.embedding,
      createdAt: memory.metadata.createdAt,
      updatedAt: memory.metadata.updatedAt,
      source: memory.metadata.source,
      fieldPurpose: memory.metadata.fieldPurpose,
      _deleted: false,
    }));

    // Bulk insert into RxDB
    await db.memories.bulkInsert(rxdbDocs);

    logger.info(`Successfully migrated ${rxdbDocs.length} memories`);

    // Mark migration as complete
    await markMigrationCompleted();

    // Optionally clear old storage (comment out if you want to keep backup)
    // await browser.storage.local.remove("local:data:memories");

    return rxdbDocs.length;
  } catch (error) {
    logger.error("Migration failed", { error });
    throw error;
  }
}

/**
 * Reset migration flag (for development/testing)
 */
export async function resetMigration(): Promise<void> {
  await browser.storage.local.remove(MIGRATION_KEY);
  logger.info("Migration flag reset");
}
