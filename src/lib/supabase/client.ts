import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.WXT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.WXT_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please set WXT_SUPABASE_URL and WXT_SUPABASE_PUBLISHABLE_KEY",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export function setSupabaseAuth(accessToken: string) {
  try {
    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: "",
    });
  } catch (error) {
    console.error("Error setting Supabase auth session:", error);
  }
}

export function clearSupabaseAuth() {
  supabase.auth.signOut();
}

export async function isSupabaseAuthenticated(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user !== null;
}
