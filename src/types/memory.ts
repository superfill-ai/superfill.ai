import { z } from "zod";
import { allowedCategories } from "@/lib/copies";

const memoryEntrySchema = z.object({
  id: z.uuid({
    version: "v7",
  }),
  syncId: z
    .uuid({
      version: "v7",
    })
    .optional(), // Phase 2: Syncing across devices
  question: z.string().optional(),
  answer: z.string(),
  category: z.enum(allowedCategories),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  metadata: z.object({
    createdAt: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
      message: "Invalid ISO timestamp",
    }),
    updatedAt: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
      message: "Invalid ISO timestamp",
    }),
    source: z.enum(["manual", "import"]),
  }),
  embedding: z.array(z.number()).optional(), // Phase 2: Vector embedding
});

export type MemoryEntry = z.infer<typeof memoryEntrySchema>;

/**
 * Simplified field mapping for storage
 * Only stores what's needed for history/analytics
 */
const filledFieldSchema = z.object({
  /** CSS selector to identify the field */
  selector: z.string(),
  /** Label text shown to user */
  label: z.string(),
  /** The value that was filled */
  filledValue: z.string(),
  /** Field type (text, email, select, etc.) */
  fieldType: z.string(),
});

export type FilledField = z.infer<typeof filledFieldSchema>;

const formMappingSchema = z.object({
  /** Page URL where form was filled */
  url: z.string().url(),
  /** Page title for display */
  pageTitle: z.string().optional(),
  /** Form selector or identifier */
  formSelector: z.string().optional(),
  /** Fields that were filled */
  fields: z.array(filledFieldSchema),
  /** Average confidence across all fills */
  confidence: z.number().min(0).max(1),
  /** When this form was filled */
  timestamp: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Invalid ISO timestamp",
  }),
});

export type FormMapping = z.infer<typeof formMappingSchema>;

const fillSessionSchema = z.object({
  id: z.uuid({
    version: "v7",
  }),
  formMappings: z.array(formMappingSchema),
  status: z.enum([
    "detecting",
    "matching",
    "reviewing",
    "filling",
    "completed",
    "failed",
  ]),
  startedAt: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Invalid ISO timestamp",
  }),
  completedAt: z
    .string()
    .refine((date) => !Number.isNaN(Date.parse(date)), {
      message: "Invalid ISO timestamp",
    })
    .optional(),
  error: z.string().optional(),
});

export type FillSession = z.infer<typeof fillSessionSchema>;

export const syncStateSchema = z.object({
  syncUrl: z.string(), // Phase 2: Unique sync URL
  syncToken: z.string(), // Phase 2: Auth token
  lastSync: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Invalid ISO timestamp",
  }),
  conflictResolution: z.enum(["local", "remote", "newest"]),
  status: z.enum(["synced", "pending", "error"]),
});

export type SyncState = z.infer<typeof syncStateSchema>;
