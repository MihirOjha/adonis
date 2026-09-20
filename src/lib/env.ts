/**
 * Environment configuration.
 *
 * Values come from Expo public env vars (prefixed EXPO_PUBLIC_), which are
 * inlined at build time. Copy `.env.example` to `.env` and fill these in with
 * your own Supabase project's values — this app is fully siloed and shares no
 * credentials with any other project.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surface a clear message during development rather than a cryptic runtime
  // failure deep inside the Supabase client.
  console.warn(
    "[Adonis] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and fill in your Supabase project values.",
  );
}

export const env = {
  supabaseUrl: url ?? "",
  supabaseAnonKey: anonKey ?? "",
  /** Whether the app is configured enough to talk to Supabase. */
  isConfigured: Boolean(url && anonKey),
};
