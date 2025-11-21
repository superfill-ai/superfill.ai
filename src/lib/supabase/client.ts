import { createClient } from "@supabase/supabase-js";
import { createLogger } from "../logger";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.WXT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.WXT_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please set WXT_SUPABASE_URL and WXT_SUPABASE_PUBLISHABLE_KEY",
  );
}

const logger = createLogger("supabase-client");

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: {
      getItem: async (key: string) => {
        const value = await browser.storage.local.get(key);
        return value[key] || null;
      },
      setItem: async (key: string, value: string) => {
        await browser.storage.local.set({ [key]: value });
      },
      removeItem: async (key: string) => {
        await browser.storage.local.remove(key);
      },
    },
  },
});

export async function setSupabaseAuth(
  accessToken: string,
  refreshToken?: string,
) {
  try {
    if (!refreshToken) {
      logger.warn("No refresh token provided, session may not persist");
      return;
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      logger.error("Error setting Supabase auth session:", error);
      throw error;
    }

    logger.info("Supabase session set successfully (persisted)", {
      hasUser: !!data.user,
      userId: data.user?.id,
    });
  } catch (error) {
    logger.error("Error setting Supabase auth session:", error);
    throw error;
  }
}

export async function clearSupabaseAuth() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    logger.error("Error clearing Supabase auth:", error);
    throw error;
  }
  logger.info("Supabase auth cleared successfully");
}

export async function isSupabaseAuthenticated(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user !== null;
}
