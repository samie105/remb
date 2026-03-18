import { NextResponse } from "next/server";
import { initiateGitHubOAuth } from "@/lib/github-actions";

/**
 * GET /api/auth/github
 * Redirects the user to GitHub's OAuth authorization page.
 * Delegates to the initiateGitHubOAuth server action for logic.
 */
export async function GET() {
  try {
    const { url } = await initiateGitHubOAuth();
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initiate OAuth" },
      { status: 500 }
    );
  }
}
