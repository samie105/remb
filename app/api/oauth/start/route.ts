import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/oauth/start
 *
 * Called by the /authorize page when the user isn't logged in.
 * Sets the return_to cookie and redirects to GitHub OAuth.
 * We need a Route Handler since Server Components can't set cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const returnTo = searchParams.get("return_to");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const ghClientId = process.env.GITHUB_CLIENT_ID;

  if (!returnTo) {
    return NextResponse.json({ error: "Missing return_to" }, { status: 400 });
  }

  if (!ghClientId) {
    return NextResponse.json(
      { error: "GitHub OAuth not configured" },
      { status: 500 }
    );
  }

  const oauthState = `mcp_oauth:${crypto.randomUUID()}`;

  const cookieStore = await cookies();

  cookieStore.set("mcp_oauth_return_to", returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  cookieStore.set("gh_oauth_state", oauthState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const ghParams = new URLSearchParams({
    client_id: ghClientId,
    redirect_uri: `${appUrl}/api/auth/github/callback`,
    scope: "read:user",
    state: oauthState,
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${ghParams.toString()}`
  );
}
