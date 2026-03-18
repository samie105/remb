import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runScan } from "@/lib/scan-runner";

/**
 * Give this function a long timeout budget so the full scan pipeline
 * (GitHub tree fetch + up to 100 GPT calls + embeddings) can complete.
 *
 * Vercel Pro:  maxDuration = 800 (max for paid plans)
 * Vercel Hobby: maxDuration = 60  (1 min — increase to Pro for heavy repos)
 */
export const maxDuration = 800;

/**
 * POST /api/scan/run
 *
 * Called internally by createScanJob. Secured with a shared secret so it
 * cannot be triggered arbitrarily from the outside.
 *
 * Body: { scanJobId, projectId, repoName, branch, githubToken }
 */
export async function POST(request: NextRequest) {
  // ------------------------------------------------------------------
  // 1. Verify internal secret
  // ------------------------------------------------------------------
  const secret = process.env.SCAN_WORKER_SECRET;
  if (!secret) {
    console.error("[scan/run] SCAN_WORKER_SECRET env var is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ------------------------------------------------------------------
  // 2. Parse body
  // ------------------------------------------------------------------
  let body: {
    scanJobId: string;
    projectId: string;
    repoName: string;
    branch: string;
    githubToken: string;
    /** Offset into the queued file list. Omit (or 0) for initial call; >0 for continuation chunks. */
    chunkOffset?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scanJobId, projectId, repoName, branch, githubToken, chunkOffset } = body;
  if (!scanJobId || !projectId || !repoName || !branch || !githubToken) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ------------------------------------------------------------------
  // 3. Confirm the scan job still exists and is in "running" state
  //    (guards against double-fire or stale requests)
  // ------------------------------------------------------------------
  const db = createAdminClient();
  const { data: job } = await db
    .from("scan_jobs")
    .select("id, status")
    .eq("id", scanJobId)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Scan job not found" }, { status: 404 });
  }
  if (job.status !== "running") {
    return NextResponse.json({ error: `Scan job already in status: ${job.status}` }, { status: 409 });
  }

  // ------------------------------------------------------------------
  // 4. Run the pipeline — this is the long-running part
  // ------------------------------------------------------------------
  try {
    const result = await runScan(scanJobId, projectId, repoName, branch, githubToken, chunkOffset ?? 0);
    return NextResponse.json({ ok: true, files_scanned: result.files_scanned });
  } catch (err) {
    // runScan already marked the job "failed" in DB before throwing
    console.error("[scan/run] Scan pipeline failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 },
    );
  }
}
