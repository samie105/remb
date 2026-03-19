import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInternalApiUrl } from "@/lib/utils";

/**
 * POST /api/scan/process-queue
 *
 * Processes the scan queue. Called after a new scan is queued.
 * Checks how many scans are running, and starts the next queued scan
 * if under the concurrency limit.
 *
 * This ensures the system handles multiple users requesting scans
 * without overwhelming the OpenAI API or server resources.
 */

const MAX_CONCURRENT_SCANS = 3;

export async function POST(request: NextRequest) {
  const secret = process.env.SCAN_WORKER_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // Count currently running scans (global)
  const { count: runningCount } = await db
    .from("scan_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");

  const currentlyRunning = runningCount ?? 0;

  if (currentlyRunning >= MAX_CONCURRENT_SCANS) {
    return NextResponse.json({
      ok: true,
      message: `Already at max concurrency (${currentlyRunning}/${MAX_CONCURRENT_SCANS}). Queued scans will start when a slot opens.`,
      running: currentlyRunning,
      started: 0,
    });
  }

  const slotsAvailable = MAX_CONCURRENT_SCANS - currentlyRunning;

  // Get next queued scans
  const { data: queuedJobs } = await db
    .from("scan_jobs")
    .select("id, project_id, result")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(slotsAvailable);

  if (!queuedJobs || queuedJobs.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No queued scans to process",
      running: currentlyRunning,
      started: 0,
    });
  }

  const appUrl = getInternalApiUrl();

  let started = 0;

  for (const job of queuedJobs) {
    const jobResult = (job.result ?? {}) as Record<string, unknown>;
    const scanType = jobResult.scan_type as string | undefined;

    // Move from queued to running
    await db
      .from("scan_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id);

    await db
      .from("projects")
      .update({ status: "scanning" })
      .eq("id", job.project_id);

    if (scanType === "local") {
      // Local scans are already being processed batch by batch — just update status
      started++;
      continue;
    }

    // GitHub scan — get the stored dispatch params
    const repoName = jobResult._dispatch_repo as string;
    const branch = jobResult._dispatch_branch as string;

    if (!repoName) {
      await db
        .from("scan_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          result: { error: "Missing dispatch data for queued scan" },
        })
        .eq("id", job.id);
      continue;
    }

    // Look up GitHub token from project owner
    const { data: proj } = await db
      .from("projects")
      .select("user_id")
      .eq("id", job.project_id)
      .single();

    const { data: owner } = proj
      ? await db.from("users").select("github_token").eq("id", proj.user_id).single()
      : { data: null };

    const githubToken = owner?.github_token;
    if (!githubToken) {
      await db
        .from("scan_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          result: { error: "GitHub token not found for project owner" },
        })
        .eq("id", job.id);
      continue;
    }

    // Clear dispatch params from result before starting
    await db
      .from("scan_jobs")
      .update({
        result: {
          logs: [{ timestamp: new Date().toISOString(), file: "", status: "scanning", message: "Starting from queue..." }],
        },
      })
      .eq("id", job.id);

    // Dispatch
    fetch(`${appUrl}/api/scan/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        scanJobId: job.id,
        projectId: job.project_id,
        repoName,
        branch,
        githubToken,
      }),
    }).catch((err) => {
      console.error("[process-queue] Failed to dispatch:", err);
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

    started++;
  }

  return NextResponse.json({
    ok: true,
    message: `Started ${started} scan(s) from queue`,
    running: currentlyRunning + started,
    started,
  });
}
