import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cli/auth/authorize?state=<state>
 * This is the page that the browser opens. It redirects to GitHub OAuth
 * with the CLI session state embedded so the callback knows it's a CLI login.
 */
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!state) {
    return NextResponse.json({ error: "Missing state parameter" }, { status: 400 });
  }

  if (!clientId) {
    return NextResponse.json({ error: "GitHub OAuth not configured" }, { status: 500 });
  }

  // Prefix the state with "cli:" so the callback can distinguish CLI vs web logins
  const oauthState = `cli:${state}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/github/callback`,
    scope: "read:user",
    state: oauthState,
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  );
}
