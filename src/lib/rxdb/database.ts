import { addRxPlugin, createRxDatabase, type RxDatabase } from "rxdb";
import { RxDBDevModePlugin } from "rxdb/plugins/dev-mode";
import { RxDBQueryBuilderPlugin } from "rxdb/plugins/query-builder";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { createLogger } from "@/lib/logger";
import { type DatabaseCollections, memorySchema } from "./schemas";

const logger = createLogger("rxdb:database");

// Add plugins
if (import.meta.env.DEV) {
  addRxPlugin(RxDBDevModePlugin);
}
addRxPlugin(RxDBQueryBuilderPlugin);

let dbPromise: Promise<RxDatabase<DatabaseCollections>> | null = null;

/**
 * Initialize or get the RxDB database instance
 */
export async function getDatabase(): Promise<RxDatabase<DatabaseCollections>> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = createDatabaseInstance();
  return dbPromise;
}

async function createDatabaseInstance(): Promise<
  RxDatabase<DatabaseCollections>
> {
  logger.info("Creating RxDB database instance");

  const db = await createRxDatabase<DatabaseCollections>({
    name: "superfill_db",
    storage: getRxStorageDexie(),
    multiInstance: true, // Enable for multiple tabs/windows
    eventReduce: true, // Optimize event handling
  });

  logger.info("Database created, adding collections");

  await db.addCollections({
    memories: {
      schema: memorySchema,
    },
  });

  logger.info("RxDB database initialized successfully");

  return db;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.close();
    dbPromise = null;
    logger.info("Database connection closed");
  }
}

/**
 * Reset the database (for testing/development)
 */
export async function resetDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.remove();
    dbPromise = null;
    logger.info("Database removed");
  }
}
