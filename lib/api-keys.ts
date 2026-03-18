"use server";

import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { UserRow } from "@/lib/supabase/types";

/* ─── helpers ─── */

/** SHA-256 hash of the raw key — deterministic, no salt needed for API keys. */
function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Generate a cryptographically random API key with a recognizable prefix. */
function generateRawKey(): string {
  return `remb_${randomBytes(24).toString("hex")}`;
}

async function requireUser(): Promise<UserRow> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.dbUser;
}

/* ─── public actions ─── */

export interface ApiKeyInfo {
  id: string;
  name: string;
  key_preview: string;
  last_used_at: string | null;
  created_at: string;
}

/** Create a new API key. Returns the full key exactly once — it is never stored in plaintext. */
export async function createApiKey(name: string): Promise<{ key: string; info: ApiKeyInfo }> {
  const user = await requireUser();
  const db = createAdminClient();

  const raw = generateRawKey();
  const keyHash = hashKey(raw);
  const preview = raw.slice(-4);

  const { data, error } = await db
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: name.trim() || "Untitled Key",
      key_hash: keyHash,
      key_preview: preview,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    key: raw,
    info: {
      id: data.id,
      name: data.name,
      key_preview: data.key_preview,
      last_used_at: data.last_used_at,
      created_at: data.created_at,
    },
  };
}

/** List all API keys for the current user (no secrets exposed). */
export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data, error } = await db
    .from("api_keys")
    .select("id, name, key_preview, last_used_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Revoke (delete) an API key. Only the owning user can revoke. */
export async function revokeApiKey(keyId: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { error } = await db
    .from("api_keys")
    .delete()
    .eq("id", keyId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/* ─── route-handler auth (NOT a server action) ─── */

/**
 * Validate an API key from an Authorization header and return the owning user.
 * Updates `last_used_at` on success. Returns null on failure.
 */
export async function validateApiKey(rawKey: string): Promise<{ user: UserRow; keyId: string } | null> {
  const db = createAdminClient();
  const keyHash = hashKey(rawKey);

  const { data: keyRow } = await db
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .single();

  if (!keyRow) return null;

  // Touch last_used_at
  await db
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  const { data: user } = await db
    .from("users")
    .select("*")
    .eq("id", keyRow.user_id)
    .single();

  if (!user) return null;
  return { user, keyId: keyRow.id };
}
