import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * POST /api/cli/scan/upload
 *
 * Accepts a batch of local files from CLI and triggers AI feature extraction.
 * This path does NOT require GitHub — it works for any local codebase.
 *
 * Body: {
 *   projectSlug: string,
 *   files: Array<{ path: string, content: string, sha?: string }>,
 *   batch: number (1-indexed),
 *   totalBatches: number,
 *   scanId?: string (re-use from first batch response)
 * }
 */
export async function POST(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const db = createAdminClient();

  let body: {
    projectSlug: string;
    files: Array<{ path: string; content: string; sha?: string }>;
    batch: number;
    totalBatches: number;
    scanId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectSlug, files, batch, totalBatches, scanId } = body;

  if (!projectSlug || !files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "Missing projectSlug or files" }, { status: 400 });
  }

  if (files.length > 50) {
    return NextResponse.json({ error: "Max 50 files per batch" }, { status: 400 });
  }

  // Resolve project
  const { data: project } = await db
    .from("projects")
    .select("id, name")
    .eq("slug", projectSlug)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Create or resume scan job
  let jobId = scanId;

  if (!jobId) {
    // Check for running scans on this project
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

    // Create new scan job
    await db.from("projects").update({ status: "scanning" }).eq("id", project.id);

    const { data: job, error } = await db
      .from("scan_jobs")
      .insert({
        project_id: project.id,
        status: "running",
        triggered_by: "cli",
        started_at: new Date().toISOString(),
        result: {
          scan_type: "local",
          files_total: 0,
          files_scanned: 0,
          features_created: 0,
          entries_created: 0,
          errors: 0,
          logs: [{ timestamp: new Date().toISOString(), file: "", status: "scanning", message: "Local scan started — receiving files from CLI" }],
        },
      })
      .select("id")
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Failed to create scan job" }, { status: 500 });
    }
    jobId = job.id;
  }

  // Dispatch to the local scan worker
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  fetch(`${appUrl}/api/scan/run-local`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SCAN_WORKER_SECRET?.trim()}`,
    },
    body: JSON.stringify({
      scanJobId: jobId,
      projectId: project.id,
      files,
      batch,
      totalBatches,
    }),
  }).catch((err) => {
    console.error("[cli/scan/upload] Failed to dispatch local scan worker:", err);
  });

  return NextResponse.json({
    scanId: jobId,
    status: batch === 1 ? "started" : "batch_received",
    message: `Batch ${batch}/${totalBatches} received (${files.length} files). Processing in background.`,
    filesReceived: files.length,
  });
}
