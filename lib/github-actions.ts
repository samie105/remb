"use server";

import { cookies } from "next/headers";
import {
  exchangeCodeForToken,
  fetchGitHubRepos,
  fetchGitHubUser,
  type GitHubRepo,
  type GitHubUser,
} from "@/lib/github";
import { createAdminClient } from "@/lib/supabase/server";

/* ─── OAuth initiation (replaces /api/auth/github route) ─── */

/** Generate the GitHub authorize URL and set a CSRF state cookie. */
export async function initiateGitHubOAuth(returnTo?: string): Promise<{ url: string }> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!clientId) {
    throw new Error("GITHUB_CLIENT_ID is not configured");
  }

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/github/callback`,
    scope: "read:user repo",
    state,
  });

  // Store state in a short-lived cookie for verification in the callback
  const cookieStore = await cookies();
  cookieStore.set("gh_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  // Store the return-to URL so the callback can redirect back
  if (returnTo) {
    cookieStore.set("gh_oauth_return_to", returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }

  return { url: `https://github.com/login/oauth/authorize?${params.toString()}` };
}

/* ─── OAuth callback (replaces /api/auth/github/callback route) ─── */

/** Exchange the OAuth code for a token, store it, and return user info. */
export async function handleGitHubCallback(
  code: string,
  state: string
): Promise<{
  success: boolean;
  user?: { login: string; avatar_url: string };
  token?: string;
  error?: string;
}> {
  const cookieStore = await cookies();
  const storedState = cookieStore.get("gh_oauth_state")?.value;

  if (!state || state !== storedState) {
    return { success: false, error: "state_mismatch" };
  }

  if (!code) {
    return { success: false, error: "no_code" };
  }

  try {
    const token = await exchangeCodeForToken(code);
    const user = await fetchGitHubUser(token);

    // Upsert the user in the database so their account exists from first login
    try {
      const db = createAdminClient();
      await db
        .from("users")
        .upsert(
          {
            github_login: user.login,
            github_avatar: user.avatar_url,
            github_token: token,
          },
          { onConflict: "github_login", ignoreDuplicates: false }
        );
    } catch {
      // Non-fatal: DB not set up yet or missing env vars — don't block the OAuth flow
    }

    // Store token in httpOnly cookie — never exposed to the client
    cookieStore.set("gh_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    // Clean up the OAuth state cookie
    cookieStore.delete("gh_oauth_state");

    return { success: true, token, user: { login: user.login, avatar_url: user.avatar_url } };
  } catch (err) {
    console.error("GitHub OAuth callback error:", err);
    return { success: false, error: "auth_failed" };
  }
}

/* ─── Connection helpers ─── */

/** Check if a GitHub token cookie exists and return user info */
export async function getGitHubConnection(): Promise<{
  connected: boolean;
  user: GitHubUser | null;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get("gh_token")?.value;
  if (!token) return { connected: false, user: null };

  try {
    const user = await fetchGitHubUser(token);
    return { connected: true, user };
  } catch {
    return { connected: false, user: null };
  }
}

/** Fetch the user's GitHub repositories using the stored token */
export async function getGitHubRepos(): Promise<GitHubRepo[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get("gh_token")?.value;
  if (!token) return [];

  try {
    return await fetchGitHubRepos(token);
  } catch {
    return [];
  }
}

/** Remove the GitHub token cookie and clear the stored token (disconnect) */
export async function disconnectGitHub(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get("gh_token")?.value;

  // Clear the token from the database
  if (token) {
    try {
      const user = await fetchGitHubUser(token);
      const db = createAdminClient();
      await db
        .from("users")
        .update({ github_token: null })
        .eq("github_login", user.login);
    } catch {
      // Non-fatal: token may already be invalid
    }
  }

  cookieStore.delete("gh_token");
}
