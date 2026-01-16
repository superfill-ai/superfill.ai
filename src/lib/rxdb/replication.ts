import type { RxCollection, RxDatabase } from "rxdb";
import { createLogger } from "@/lib/logger";
import { supabase } from "@/lib/supabase/client";
import type { DatabaseCollections, MemoryDocType } from "./schemas";

const logger = createLogger("rxdb:replication");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let replicationState: any = null;

/**
 * Start Supabase replication for memories collection
 */
export async function startReplication(
  db: RxDatabase<DatabaseCollections>,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (replicationState) {
    logger.info("Replication already running");
    return replicationState;
  }

  logger.info("Starting Supabase replication for memories");

  try {
    // Dynamic import to avoid type issues
    const { replicateSupabase } = await import("rxdb-supabase");

    const options = {
      supabaseClient: supabase,
      collection: db.memories as RxCollection<MemoryDocType>,
      replicationIdentifier: `memories-${userId}`,
      pull: {
        realtimePostgresChanges: true,
      },
      push: {
        modifier: (doc: MemoryDocType) => {
          return {
            local_id: doc.id,
            question: doc.question || null,
            answer: doc.answer,
            category: doc.category,
            tags: doc.tags,
            confidence: doc.confidence,
            embedding:
              doc.embedding && doc.embedding.length > 0
                ? `[${doc.embedding.join(",")}]`
                : null,
            source: doc.source,
            created_at: doc.createdAt,
            updated_at: doc.updatedAt,
            is_deleted: doc._deleted,
          };
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replicationState = replicateSupabase(options) as any;

    if (replicationState) {
      // Log replication events
      replicationState.error$.subscribe((error: unknown) => {
        logger.error("Replication error", { error });
      });

      replicationState.active$.subscribe((active: boolean) => {
        logger.debug("Replication active state changed", { active });
      });

      // Wait for initial sync
      await replicationState.awaitInitialReplication();
      logger.info("Initial replication completed");
    }

    return replicationState;
  } catch (error) {
    logger.error("Failed to start replication", { error });
    return null;
  }
}

/**
 * Stop the replication
 */
export async function stopReplication(): Promise<void> {
  if (replicationState) {
    await replicationState.cancel();
    replicationState = null;
    logger.info("Replication stopped");
  }
}

/**
 * Check if replication is active
 */
export function isReplicationActive(): boolean {
  return replicationState !== null && !replicationState.isStopped();
}

/**
 * Force a sync now
 */
export async function syncNow(): Promise<void> {
  if (replicationState) {
    await replicationState.reSync();
    logger.info("Manual sync triggered");
  }
}
