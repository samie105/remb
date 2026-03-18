"use server";

import { cookies } from "next/headers";
import { fetchGitHubUser, type GitHubUser } from "@/lib/github";
import { createAdminClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/supabase/types";

export interface AuthSession {
  user: GitHubUser;
  dbUser: UserRow;
}

/**
 * Resolve the current authenticated user from the gh_token cookie.
 * Returns null if not authenticated. Does NOT redirect — the caller decides.
 */
export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("gh_token")?.value;
  if (!token) return null;

  try {
    const user = await fetchGitHubUser(token);

    // Ensure user exists in DB
    const db = createAdminClient();
    const { data: dbUser } = await db
      .from("users")
      .upsert(
        {
          github_login: user.login,
          github_avatar: user.avatar_url,
          name: user.name,
        },
        { onConflict: "github_login", ignoreDuplicates: false }
      )
      .select()
      .single();

    if (!dbUser) return null;

    return { user, dbUser };
  } catch {
    return null;
  }
}

/**
 * Sign out — clears the gh_token cookie.
 */
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("gh_token");
}
