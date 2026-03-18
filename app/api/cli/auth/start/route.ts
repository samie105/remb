import { NextResponse } from "next/server";
import { createCliAuthSession } from "@/lib/cli-oauth";

/**
 * POST /api/cli/auth/start
 * Creates a pending CLI auth session and returns the browser URL to open.
 * The CLI calls this, then opens the URL in the user's browser.
 */
export async function POST() {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { state } = await createCliAuthSession();

    // The browser URL points to the CLI-specific OAuth initiation
    const authUrl = `${appUrl}/api/cli/auth/authorize?state=${state}`;

    return NextResponse.json({ state, authUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create auth session" },
      { status: 500 }
    );
  }
}
