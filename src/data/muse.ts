import { supabase } from "@/lib/supabase";

/**
 * Scoped Muse API tokens.
 *
 * A token lets a Muse account act as ONE user against the `muse` edge function.
 * The raw token is shown ONCE at creation; only its SHA-256 hash is stored.
 * Tokens are revocable (revoke = set revoked_at) and scoped by Row-Level
 * Security to the owning user.
 */

export interface MuseTokenRow {
  id: string;
  user_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Generate a cryptographically random opaque token string. */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `muse_${body}`;
}

/** SHA-256 hex of a string (must match the DB's digest(token,'sha256')). */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a new Muse token for the user. Returns the RAW token — show it to the
 * user immediately; it is not recoverable later (only the hash is stored).
 */
export async function createMuseToken(
  userId: string,
  label = "Muse",
): Promise<string> {
  const token = generateToken();
  const token_hash = await sha256Hex(token);
  const { error } = await supabase
    .from("muse_tokens")
    .insert({ user_id: userId, label, token_hash });
  if (error) throw error;
  return token;
}

/** List the user's tokens (metadata only — never the raw token). */
export async function listMuseTokens(userId: string): Promise<MuseTokenRow[]> {
  const { data, error } = await supabase
    .from("muse_tokens")
    .select("id, user_id, label, created_at, last_used_at, revoked_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MuseTokenRow[];
}

/** Revoke a token (soft-delete: sets revoked_at). */
export async function revokeMuseToken(tokenId: string): Promise<void> {
  const { error } = await supabase
    .from("muse_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId);
  if (error) throw error;
}
