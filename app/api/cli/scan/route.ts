import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getLatestCommitSha } from "@/lib/github-reader";

/**
 * GET /api/cli/scan?scanId=<uuid>
 *
 * Poll scan job progress. Returns status, progress percentage, and recent logs.
 */
export async function GET(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const { searchParams } = new URL(request.url);
  const scanId = searchParams.get("scanId");

  if (!scanId) {
    return NextResponse.json({ error: "Missing scanId" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: job } = await db
    .from("scan_jobs")
    .select("id, status, result, started_at, finished_at, project_id")
    .eq("id", scanId)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Scan job not found" }, { status: 404 });
  }

  // Verify ownership
  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("id", job.project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Scan job not found" }, { status: 404 });
  }

  const result = (job.result ?? {}) as Record<string, unknown>;
  const filesTotal = (result.files_total as number) ?? 0;
  const filesScanned = (result.files_scanned as number) ?? 0;
  const logs = (result.logs as Array<{ timestamp: string; file: string; status: string; feature?: string; message?: string }>) ?? [];
  const percentage = filesTotal > 0 ? Math.round((filesScanned / filesTotal) * 100) : 0;

  return NextResponse.json({
    scanId: job.id,
    status: job.status,
    filesTotal,
    filesScanned,
    percentage,
    logs: logs.slice(-10), // last 10 log entries
    featuresCreated: (result.features_created as number) ?? 0,
    errors: (result.errors as number) ?? 0,
    durationMs: (result.duration_ms as number) ?? 0,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
  });
}

/**
 * POST /api/cli/scan
 *
 * Triggers a server-side scan from the CLI (`remb push`).
 * Verifies the repo has a recent push before starting.
 *
 * Body: { projectSlug: string }
 * Returns: { scanId, status, message }
 */
export async function POST(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const db = createAdminClient();

  let body: { projectSlug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectSlug } = body;
  if (!projectSlug) {
    return NextResponse.json({ error: "Missing projectSlug" }, { status: 400 });
  }

  // Resolve project
  const { data: project } = await db
    .from("projects")
    .select("id, name, repo_name, branch")
    .eq("slug", projectSlug)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.repo_name) {
    return NextResponse.json(
      { error: "This project has no connected GitHub repository. Link one first." },
      { status: 400 },
    );
  }

  // Check for running scans
  const { data: existing } = await db
    .from("scan_jobs")
    .select("id, status")
    .eq("project_id", project.id)
    .in("status", ["queued", "running"])
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({
      scanId: existing[0].id,
      status: "already_running",
      message: "A scan is already in progress for this project.",
    });
  }

  // Get GitHub token
  const { data: userData } = await db
    .from("users")
    .select("github_token")
    .eq("id", user.id)
    .single();

  if (!userData?.github_token) {
    return NextResponse.json(
      { error: "GitHub token not found. Run `remb login` to authenticate." },
      { status: 401 },
    );
  }

  // Check for new commits since last scan
  let currentSha: string | null = null;
  try {
    currentSha = await getLatestCommitSha(
      userData.github_token,
      project.repo_name,
      project.branch ?? "main",
    );
  } catch {
    // Can't check — proceed anyway
  }

  const { data: lastScan } = await db
    .from("scan_jobs")
    .select("result")
    .eq("project_id", project.id)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const lastSha = (lastScan?.result as Record<string, unknown> | null)?.commit_sha as string | undefined;
  if (currentSha && lastSha && currentSha === lastSha) {
    return NextResponse.json({
      scanId: null,
      status: "up_to_date",
      message: "No new commits since the last scan — your context is up to date.",
      currentSha,
    });
  }

  // Create scan job and dispatch
  await db.from("projects").update({ status: "scanning" }).eq("id", project.id);

  const { data: job, error } = await db
    .from("scan_jobs")
    .insert({
      project_id: project.id,
      status: "running",
      triggered_by: "cli",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Failed to create scan job" }, { status: 500 });
  }

  // Fire-and-forget to scan worker
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  fetch(`${appUrl}/api/scan/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SCAN_WORKER_SECRET?.trim()}`,
    },
    body: JSON.stringify({
      scanJobId: job.id,
      projectId: project.id,
      repoName: project.repo_name,
      branch: project.branch ?? "main",
      githubToken: userData.github_token,
    }),
  }).catch((err) => {
    console.error("[cli/scan] Failed to dispatch scan worker:", err);
    createAdminClient()
      .from("scan_jobs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        result: { error: "Failed to start scan worker: " + String(err) },
      })
      .eq("id", job.id)
      .then(undefined, () => {});
  });

  return NextResponse.json({
    scanId: job.id,
    status: "started",
    message: `Scan started for ${project.name}. It will run in the background.`,
    currentSha,
  });
}
