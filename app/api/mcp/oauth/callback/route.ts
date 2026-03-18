import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { completeMcpOAuth } from "@/lib/mcp-oauth";

/**
 * GET /api/mcp/oauth/callback
 *
 * The MCP provider redirects the user here after they approve access.
 * We exchange the authorization code for tokens, save them, then
 * render a small HTML page that tells the opener popup "done" and closes itself.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const serverId = searchParams.get("server_id");
  const error = searchParams.get("error");

  // If the provider sent an error (user denied, etc.)
  if (error) {
    return new NextResponse(
      closePopupHtml(`Authorization denied: ${error}`),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !serverId) {
    return new NextResponse(
      closePopupHtml("Missing authorization code or server ID."),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // Verify the user is logged in
  const session = await getSession();
  if (!session) {
    return new NextResponse(
      closePopupHtml("Not authenticated. Please log in and try again."),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    await completeMcpOAuth(serverId, session.dbUser.id, code);
    return new NextResponse(closePopupHtml(null), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token exchange failed";
    return new NextResponse(closePopupHtml(msg), {
      headers: { "Content-Type": "text/html" },
    });
  }
}

/**
 * Returns a minimal HTML page that:
 * - Posts a message to the opener window (so the UI knows auth is complete)
 * - Closes itself after a short delay
 */
function closePopupHtml(error: string | null): string {
  const payload = JSON.stringify({ type: "mcp-oauth-complete", error });
  return `<!DOCTYPE html>
<html>
<head><title>MCP Authentication</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
  <div style="text-align:center">
    <p>${error ? `Error: ${escapeHtml(error)}` : "Authentication successful! This window will close."}</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage(${payload}, window.location.origin);
    }
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
