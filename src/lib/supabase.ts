import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { env } from "./env";
import type { Database } from "./database.types";

/**
 * Supabase client, configured for both native (AsyncStorage-backed session
 * persistence) and web (default localStorage + URL session detection for
 * OAuth redirects).
 */
export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      // On native we persist the session in AsyncStorage; on web the default
      // localStorage implementation is used.
      storage: Platform.OS === "web" ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
    },
  },
);
