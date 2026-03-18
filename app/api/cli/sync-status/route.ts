import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getLatestCommitSha } from "@/lib/github-reader";

/**
 * GET /api/cli/sync-status?projectSlug=<slug>
 *
 * Returns sync status: whether the project has new commits since last scan,
 * the last scanned SHA, current HEAD SHA, and last scan timestamp.
 */
export async function GET(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const { searchParams } = new URL(request.url);
  const projectSlug = searchParams.get("projectSlug");

  if (!projectSlug) {
    return NextResponse.json({ error: "Missing projectSlug" }, { status: 400 });
  }

  const db = createAdminClient();

  const { data: project } = await db
    .from("projects")
    .select("id, name, repo_name, branch, status")
    .eq("slug", projectSlug)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // No repo linked
  if (!project.repo_name) {
    return NextResponse.json({
      synced: false,
      hasRepo: false,
      currentSha: null,
      lastScannedSha: null,
      lastScanAt: null,
      status: project.status,
      message: "No GitHub repository linked to this project.",
    });
  }

  // Get GitHub token
  const { data: userData } = await db
    .from("users")
    .select("github_token")
    .eq("id", user.id)
    .single();

  // Get last scan info
  const { data: lastScan } = await db
    .from("scan_jobs")
    .select("result, finished_at")
    .eq("project_id", project.id)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const lastScannedSha =
    (lastScan?.result as Record<string, unknown> | null)?.commit_sha as string | null ?? null;
  const lastScanAt = lastScan?.finished_at ?? null;

  // Try to get current HEAD SHA from GitHub
  let currentSha: string | null = null;
  if (userData?.github_token) {
    try {
      currentSha = await getLatestCommitSha(
        userData.github_token,
        project.repo_name,
        project.branch ?? "main"
      );
    } catch {
      // Can't reach GitHub — return partial info
    }
  }

  const synced = !!(currentSha && lastScannedSha && currentSha === lastScannedSha);

  return NextResponse.json({
    synced,
    hasRepo: true,
    currentSha,
    lastScannedSha,
    lastScanAt,
    status: project.status,
    message: synced
      ? "Project is up to date."
      : currentSha && lastScannedSha
        ? "New commits since last scan."
        : lastScannedSha
          ? "Could not check GitHub — token may be missing."
          : "Project has never been scanned.",
  });
}
