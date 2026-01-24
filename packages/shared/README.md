# @superfill/shared

Shared TypeScript types, AI logic, providers, encryption, and utilities for Superfill.ai.

## Exports

### Types

```typescript
import type { Memory, MemoryEntry } from '@superfill/shared/types/memory';
import type { Settings, AISettings } from '@superfill/shared/types/settings';
import type { AutofillField } from '@superfill/shared/types/autofill';
import type { WebsiteContext } from '@superfill/shared/types/context';
import type { Theme } from '@superfill/shared/types/theme';
import type { TriggerMode } from '@superfill/shared/types/trigger';
```

### AI Logic

```typescript
import { BulkCategorizer } from '@superfill/shared/ai/bulk-categorizer';
import { CategorizationService } from '@superfill/shared/ai/categorization-service';
import { DeduplicationCategorizer } from '@superfill/shared/ai/deduplication-categorizer';
import { ModelFactory } from '@superfill/shared/ai/model-factory';
```

### Providers

```typescript
import { ModelService } from '@superfill/shared/providers/model-service';
import { registry } from '@superfill/shared/providers/registry';
```

### Security

```typescript
import { encrypt, decrypt } from '@superfill/shared/security/encryption';
import { generateFingerprint } from '@superfill/shared/security/fingerprint';
import { KeyValidationService } from '@superfill/shared/security/key-validation-service';
```

### Utilities

```typescript
import { cn } from '@superfill/shared/cn';
import { delay } from '@superfill/shared/delay';
import { logger } from '@superfill/shared/logger';
import { parseCSV, exportCSV } from '@superfill/shared/csv';
import { createErrorMessage } from '@superfill/shared/errors';
```

## Tech Stack

- TypeScript 5.7+
- Vercel AI SDK
- Zod (validation)
- Langfuse (observability)
- React Query (data fetching)
