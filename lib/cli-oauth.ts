import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/supabase/types";

const SESSION_TTL_MINUTES = 10;

/** Create a pending CLI auth session and return the state token. */
export async function createCliAuthSession(): Promise<{ state: string; expiresAt: string }> {
  const db = createAdminClient();
  const state = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await db
    .from("cli_auth_sessions")
    .insert({ state, expires_at: expiresAt });

  if (error) throw new Error(error.message);
  return { state, expiresAt };
}

/** After OAuth success, generate an API key and attach it to the session. */
export async function completeCliAuthSession(state: string, user: UserRow): Promise<void> {
  const db = createAdminClient();

  // Verify the session is still pending and not expired
  const { data: session } = await db
    .from("cli_auth_sessions")
    .select("id, status, expires_at")
    .eq("state", state)
    .single();

  if (!session) throw new Error("Session not found");
  if (session.status !== "pending") throw new Error("Session already used");
  if (new Date(session.expires_at) < new Date()) throw new Error("Session expired");

  // Generate an API key for this user
  const raw = `remb_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(raw).digest("hex");
  const preview = raw.slice(-4);

  const { error: keyErr } = await db
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: "CLI Login (auto-generated)",
      key_hash: keyHash,
      key_preview: preview,
    });

  if (keyErr) throw new Error(keyErr.message);

  // Store the raw key in the session so the CLI can poll for it
  const { error: updateErr } = await db
    .from("cli_auth_sessions")
    .update({ status: "completed", api_key: raw, user_id: user.id })
    .eq("id", session.id);

  if (updateErr) throw new Error(updateErr.message);
}

/** Poll for a completed session. Returns the API key if ready, null if still pending. */
export async function pollCliAuthSession(state: string): Promise<{
  status: "pending" | "completed" | "expired";
  apiKey?: string;
  login?: string;
}> {
  const db = createAdminClient();

  const { data: session } = await db
    .from("cli_auth_sessions")
    .select("id, status, api_key, user_id, expires_at")
    .eq("state", state)
    .single();

  if (!session) return { status: "expired" };
  if (new Date(session.expires_at) < new Date()) {
    // Clean up expired session
    await db.from("cli_auth_sessions").delete().eq("id", session.id);
    return { status: "expired" };
  }

  if (session.status === "completed" && session.api_key) {
    // Fetch the user login for display
    let login: string | undefined;
    if (session.user_id) {
      const { data: user } = await db
        .from("users")
        .select("github_login")
        .eq("id", session.user_id)
        .single();
      login = user?.github_login;
    }

    // Clear the raw key from the session after retrieval (one-time read)
    await db
      .from("cli_auth_sessions")
      .update({ api_key: null })
      .eq("id", session.id);

    return { status: "completed", apiKey: session.api_key, login };
  }

  return { status: "pending" };
}
