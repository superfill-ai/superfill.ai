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

const formFieldSchema = z.object({
  element: z.any(), // Placeholder for HTMLElement
  type: z.string(), // 'text' | 'email' | 'textarea' | etc.
  name: z.string(), // Field name/id
  label: z.string(), // Visible label (could be html-for or wrapping label or aria-label, etc.)
  placeholder: z.string().optional(),
  required: z.boolean(),
  currentValue: z.string(),
  rect: z.any().optional(), // Placeholder for DOMRect (positioning)
});

export type FormField = z.infer<typeof formFieldSchema>;

const formMappingSchema = z.object({
  url: z.url(),
  formId: z.string().optional(),
  fields: z.array(formFieldSchema),
  matches: z.map(z.string(), memoryEntrySchema),
  confidence: z.number().min(0).max(1),
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
