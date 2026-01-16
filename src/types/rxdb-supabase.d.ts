// Type declaration for rxdb-supabase module
// This is needed because the package has type export issues with package.json "exports"
declare module "rxdb-supabase" {
  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { RxCollection } from "rxdb";

  export interface SupabaseReplicationOptions<RxDocType> {
    supabaseClient: SupabaseClient;
    collection: RxCollection<RxDocType>;
    replicationIdentifier: string;
    pull?: {
      realtimePostgresChanges?: boolean;
    };
    push?: {
      modifier?: (doc: RxDocType) => Record<string, unknown>;
    };
  }

  export function replicateSupabase<RxDocType>(
    options: SupabaseReplicationOptions<RxDocType>,
  ): unknown;
}
