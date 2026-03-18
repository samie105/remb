import { NextRequest, NextResponse } from "next/server";
import { pollCliAuthSession } from "@/lib/cli-oauth";

/**
 * GET /api/cli/auth/poll?state=<state>
 * The CLI polls this endpoint until the browser OAuth flow completes.
 * Returns:
 *   { status: "pending" }                         — still waiting
 *   { status: "completed", apiKey: "remb_...", login: "user" }  — done
 *   { status: "expired" }                          — session timed out
 */
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");

  if (!state) {
    return NextResponse.json({ error: "Missing state parameter" }, { status: 400 });
  }

  try {
    const result = await pollCliAuthSession(state);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Poll failed" },
      { status: 500 }
    );
  }
}
