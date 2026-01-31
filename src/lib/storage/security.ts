import type { EncryptedKey } from "@/types/settings";

export const apiKeys = storage.defineItem<Record<string, EncryptedKey>>(
  "local:security:api-keys",
  {
    fallback: {},
    version: 1,
  },
);
