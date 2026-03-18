import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, fetchGitHubUser } from "@/lib/github";
import { createAdminClient } from "@/lib/supabase/server";
import { completeCliAuthSession } from "@/lib/cli-oauth";

/**
 * GET /api/cli/auth/callback?code=<code>&state=cli:<session_state>
 * GitHub redirects here after the user authorises. This endpoint:
 * 1. Exchanges the code for a GitHub token
 * 2. Upserts the user in the DB
 * 3. Generates an API key and stores it in the CLI auth session
 * 4. Shows a success page (user can close the browser tab)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const oauthState = searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!code || !oauthState || !oauthState.startsWith("cli:")) {
    return NextResponse.redirect(`${appUrl}/auth?error=invalid_cli_callback`);
  }

  // Extract the original CLI session state
  const cliState = oauthState.slice(4);

  try {
    const token = await exchangeCodeForToken(code);
    const ghUser = await fetchGitHubUser(token);

    // Upsert user in DB
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
      return new NextResponse(renderHtml("Authentication Failed", "Could not create user account. Please try again."), {
        status: 500,
        headers: { "Content-Type": "text/html" },
      });
    }

    // Complete the CLI auth session — generates API key
    await completeCliAuthSession(cliState, dbUser);

    return new NextResponse(
      renderHtml(
        "CLI Authenticated!",
        `Signed in as <strong>${ghUser.login}</strong>. You can close this tab and return to your terminal.`
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("CLI OAuth callback error:", err);
    return new NextResponse(
      renderHtml("Authentication Failed", "Something went wrong during authentication. Please try again from the CLI."),
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
}

function renderHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Remb — ${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
    .card { text-align: center; padding: 2rem 3rem; border: 1px solid #222; border-radius: 12px; max-width: 420px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #888; line-height: 1.6; }
    strong { color: #fafafa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
