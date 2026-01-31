import { z } from "zod";

export const syncedUserSettingsSchema = z.object({
  autoFillEnabled: z.boolean(),
  confidenceThreshold: z.number(),
  selectedProvider: z.string(),
});

export type SyncedUserSettings = z.infer<typeof syncedUserSettingsSchema>;

export const syncConfigSchema = z.object({
  authUserId: z.string(),
  email: z.string().optional(),
  name: z.string().optional(),

  lastSync: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Invalid ISO timestamp",
  }),
  conflictResolution: z.enum(["local", "remote", "newest"]),
  status: z.enum(["synced", "pending", "error", "not_configured"]),
  enabled: z.boolean(),

  lastError: z.string().optional(),
});

export type SyncConfig = z.infer<typeof syncConfigSchema>;

export const syncOperationResultSchema = z.object({
  success: z.boolean(),
  operation: z.enum(["push", "pull", "full_sync"]),
  itemsSynced: z.number(),
  conflictsResolved: z.number(),
  errors: z.array(z.string()),
  timestamp: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Invalid ISO timestamp",
  }),
});

export type SyncOperationResult = z.infer<typeof syncOperationResultSchema>;

export const syncMemoryEntrySchema = z.object({
  localId: z.string(),
  question: z.string().optional(),
  answer: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  embedding: z.array(z.number()).optional(),
  metadata: z.object({
    createdAt: z.number(),
    updatedAt: z.number(),
    source: z.string(),
  }),
  isDeleted: z.boolean(),
  deletedAt: z.number().optional(),
});

export type SyncMemoryEntry = z.infer<typeof syncMemoryEntrySchema>;

export const syncConflictSchema = z.object({
  localId: z.string(),
  localVersion: syncMemoryEntrySchema,
  remoteVersion: syncMemoryEntrySchema,
  conflictType: z.enum(["update_update", "update_delete", "delete_update"]),
  resolution: z.enum(["local", "remote", "manual"]).optional(),
});

export type SyncConflict = z.infer<typeof syncConflictSchema>;

export const userProfileSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  image: z.string().optional(),
  lastSyncedAt: z.number().optional(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
