import { createLogger } from "@/lib/logger";
import { decrypt, encrypt } from "@/lib/security/encryption";
import { getBrowserFingerprint } from "@/lib/security/fingerprint";
import type { EncryptedKey } from "@/types/settings";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const logger = createLogger("store:auth");

type AuthStoreState = {
  encryptedToken: EncryptedKey | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
};

type AuthActions = {
  setAuthToken: (token: string) => Promise<void>;
  getAuthToken: () => Promise<string | null>;
  clearAuthToken: () => Promise<void>;
  checkAuthStatus: () => Promise<boolean>;
};

const AUTH_STORAGE_KEY = "superfill:auth:encrypted";

export const useAuthStore = create<AuthStoreState & AuthActions>()(
  persist(
    (set, get) => ({
      encryptedToken: null,
      isAuthenticated: false,
      loading: false,
      error: null,

      setAuthToken: async (token: string) => {
        try {
          set({ loading: true, error: null });

          const fingerprint = await getBrowserFingerprint();
          const salt = fingerprint.slice(0, 32);
          const encryptedData = await encrypt(token, fingerprint, salt);

          const encryptedToken: EncryptedKey = {
            encrypted: encryptedData,
            salt,
          };

          set({
            encryptedToken,
            isAuthenticated: true,
            loading: false,
          });

          logger.info("Auth token encrypted and stored successfully");
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to store auth token";
          logger.error("Failed to encrypt and store auth token", { error });
          set({ loading: false, error: errorMessage, isAuthenticated: false });
          throw error;
        }
      },

      getAuthToken: async () => {
        try {
          const { encryptedToken } = get();

          if (!encryptedToken) {
            return null;
          }

          const fingerprint = await getBrowserFingerprint();
          const decryptedToken = await decrypt(
            encryptedToken.encrypted,
            fingerprint,
            encryptedToken.salt,
          );

          return decryptedToken;
        } catch (error) {
          logger.error("Failed to decrypt auth token", { error });
          set({
            error: "Failed to decrypt auth token",
            isAuthenticated: false,
          });
          return null;
        }
      },

      clearAuthToken: async () => {
        try {
          set({
            encryptedToken: null,
            isAuthenticated: false,
            loading: false,
            error: null,
          });

          logger.info("Auth token cleared successfully");
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to clear auth token";
          logger.error("Failed to clear auth token", { error });
          set({ error: errorMessage });
          throw error;
        }
      },

      checkAuthStatus: async () => {
        try {
          const token = await get().getAuthToken();
          const isAuthenticated = !!token;

          set({ isAuthenticated });

          return isAuthenticated;
        } catch (error) {
          logger.error("Failed to check auth status", { error });
          set({ isAuthenticated: false });
          return false;
        }
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => ({
        getItem: async (name: string) => {
          try {
            const value = await browser.storage.local.get(name);
            return value[name] || null;
          } catch (error) {
            logger.error("Failed to get auth state from storage", { error });
            return null;
          }
        },
        setItem: async (name: string, value: string) => {
          try {
            await browser.storage.local.set({ [name]: value });
          } catch (error) {
            logger.error("Failed to set auth state in storage", { error });
          }
        },
        removeItem: async (name: string) => {
          try {
            await browser.storage.local.remove(name);
          } catch (error) {
            logger.error("Failed to remove auth state from storage", { error });
          }
        },
      })),
    },
  ),
);
