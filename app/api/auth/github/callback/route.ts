import { NextRequest, NextResponse } from "next/server";
import { handleGitHubCallback } from "@/lib/github-actions";
import { exchangeCodeForToken, fetchGitHubUser } from "@/lib/github";
import { createAdminClient } from "@/lib/supabase/server";
import { completeCliAuthSession } from "@/lib/cli-oauth";

/**
 * GET /api/auth/github/callback
 * GitHub redirects here after the user authorises.
 * Handles both web logins and CLI logins (state prefixed with "cli:").
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/auth?error=missing_params`);
  }

  // ── CLI login branch ────────────────────────────────────────────────────
  if (state.startsWith("cli:")) {
    const cliState = state.slice(4);
    try {
      const token = await exchangeCodeForToken(code);
      const ghUser = await fetchGitHubUser(token);

      const db = createAdminClient();
      const { data: dbUser } = await db
        .from("users")
        .upsert(
          {
            github_login: ghUser.login,
            github_avatar: ghUser.avatar_url,
            github_token: token,
            name: ghUser.name,
          },
          { onConflict: "github_login", ignoreDuplicates: false }
        )
        .select()
        .single();

      if (!dbUser) {
        return new NextResponse(cliHtml("Authentication Failed", "Could not create user account. Please try again."), {
          status: 500,
          headers: { "Content-Type": "text/html" },
        });
      }

      await completeCliAuthSession(cliState, dbUser);

      return new NextResponse(
        cliHtml("CLI Authenticated!", `Signed in as <strong>${ghUser.login}</strong>. You can close this tab and return to your terminal.`),
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    } catch (err) {
      console.error("CLI OAuth callback error:", err);
      return new NextResponse(
        cliHtml("Authentication Failed", "Something went wrong. Please try again from the CLI."),
        { status: 500, headers: { "Content-Type": "text/html" } }
      );
    }
  }

  // ── MCP OAuth branch ──────────────────────────────────────────────────────
  if (state.startsWith("mcp_oauth:")) {
    try {
      const token = await exchangeCodeForToken(code);
      const ghUser = await fetchGitHubUser(token);

      const db = createAdminClient();
      await db
        .from("users")
        .upsert(
          {
            github_login: ghUser.login,
            github_avatar: ghUser.avatar_url,
            github_token: token,
            name: ghUser.name,
          },
          { onConflict: "github_login", ignoreDuplicates: false }
        );

      // Set session cookie so /authorize page can read it
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.set("gh_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });

      // Redirect back to the stored authorize URL
      const returnTo = cookieStore.get("mcp_oauth_return_to")?.value;
      cookieStore.delete("mcp_oauth_return_to");

      if (returnTo) {
        return NextResponse.redirect(returnTo);
      }
      return NextResponse.redirect(`${appUrl}/dashboard`);
    } catch (err) {
      console.error("MCP OAuth login error:", err);
      return NextResponse.redirect(`${appUrl}/auth?error=auth_failed`);
    }
  }

  // ── Web login branch ─────────────────────────────────────────────────────
  const result = await handleGitHubCallback(code, state);

  if (!result.success || !result.user) {
    return NextResponse.redirect(
      `${appUrl}/auth?error=${result.error ?? "auth_failed"}`
    );
  }

  // Read the return-to URL stored before the OAuth redirect
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const returnTo = cookieStore.get("gh_oauth_return_to")?.value;
  cookieStore.delete("gh_oauth_return_to");

  // Check if user has 2FA enabled
  const { data: user2fa } = await createAdminClient()
    .from("users")
    .select("id, two_factor_enabled")
    .eq("github_login", result.user.login)
    .single();

  if (user2fa?.two_factor_enabled && result.token) {
    // Remove the gh_token cookie that handleGitHubCallback set
    cookieStore.delete("gh_token");

    // Store pending 2FA cookies
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 600, // 10 minutes
      path: "/",
    };
    cookieStore.set("2fa_pending_user", user2fa.id, cookieOpts);
    cookieStore.set("2fa_pending_token", result.token, cookieOpts);

    // Stash return-to for after 2FA
    if (returnTo) {
      cookieStore.set("2fa_return_to", returnTo, cookieOpts);
    }

    return NextResponse.redirect(`${appUrl}/auth/2fa`);
  }

  const redirectUrl = new URL(returnTo ?? "/dashboard", appUrl);
  redirectUrl.searchParams.set("gh_connected", "true");
  redirectUrl.searchParams.set("gh_user", result.user.login);
  redirectUrl.searchParams.set("gh_avatar", result.user.avatar_url);

  return NextResponse.redirect(redirectUrl.toString());
}

function cliHtml(title: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Remb — ${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#09090b;color:#fafafa}
.card{text-align:center;max-width:380px;padding:2rem;border:1px solid #27272a;border-radius:12px;background:#18181b}
h1{font-size:1.1rem;font-weight:600;margin:0 0 .5rem}p{font-size:.875rem;color:#a1a1aa;margin:0;line-height:1.5}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}
