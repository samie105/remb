"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getLatestCommitSha } from "@/lib/github-reader";
import { getInternalApiUrl, getInternalFetchHeaders } from "@/lib/utils";
import type { ScanJobRow } from "@/lib/supabase/types";

/* ─── types ─── */

export type ScanJobWithProject = ScanJobRow & {
  project_name: string;
  project_slug: string;
};

export type ScanLogEntry = {
  timestamp: string;
  file: string;
  status: "scanning" | "done" | "skipped" | "error";
  feature?: string;
  message?: string;
  elapsed_ms?: number;
};

export type ScanResult = {
  files_total: number;
  files_scanned: number;
  features_created: number;
  entries_created: number;
  errors: number;
  duration_ms: number;
  logs: ScanLogEntry[];
  tech_stack: string[];
  languages: Record<string, number>;
  commit_sha?: string;
  error?: string;
  /** IDs of all features created or updated during this scan. Used as fallback when context_entries were not created (e.g. embedding failure). */
  feature_ids?: string[];
  /** Number of files remaining unscanned after this pass (due to MAX_FILES cap). 0 means all files indexed. */
  files_remaining?: number;
  /* ── Architecture metadata (set by scan-dispatch) ── */
  _trigger_run_id?: string;
  _machine?: string;
  _max_duration?: number;
  _estimated_files?: number;
  _estimated_size_kb?: number;
};

const STALE_SCAN_MS = 15 * 60 * 1000;

/** Check if the repo has new changes since the last scan. Returns the current SHA and whether scanning is needed. */
export async function checkForChanges(projectId: string): Promise<{ hasChanges: boolean; currentSha: string | null; lastScannedSha: string | null }> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const db = createAdminClient();

  const { data: project } = await db
    .from("projects")
    .select("repo_name, branch, user_id")
    .eq("id", projectId)
    .eq("user_id", session.dbUser.id)
    .single();

  if (!project?.repo_name) return { hasChanges: true, currentSha: null, lastScannedSha: null };

  // Get GitHub token — backfilled by getSession()
  const { data: user } = await db
    .from("users")
    .select("github_token")
    .eq("id", session.dbUser.id)
    .single();

  const githubToken = user?.github_token ?? null;
  if (!githubToken) return { hasChanges: true, currentSha: null, lastScannedSha: null };

  // Fetch current HEAD SHA
  let currentSha: string;
  try {
    currentSha = await getLatestCommitSha(githubToken, project.repo_name, project.branch ?? "main");
  } catch {
    return { hasChanges: true, currentSha: null, lastScannedSha: null };
  }

  // Find the last successful scan's commit_sha
  const { data: lastScan } = await db
    .from("scan_jobs")
    .select("result")
    .eq("project_id", projectId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const lastScannedSha = (lastScan?.result as ScanResult | null)?.commit_sha ?? null;

  return {
    hasChanges: !lastScannedSha || lastScannedSha !== currentSha,
    currentSha,
    lastScannedSha,
  };
}

async function recoverStaleProjectScans(db: ReturnType<typeof createAdminClient>, projectId: string) {
  const cutoff = new Date(Date.now() - STALE_SCAN_MS).toISOString();

  const { data: staleRunning } = await db
    .from("scan_jobs")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "running")
    .lt("started_at", cutoff);

  const staleRunningIds = (staleRunning ?? []).map((j) => j.id);

  if (staleRunningIds.length > 0) {
    await db
      .from("scan_jobs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        result: {
          error: "Scan timed out or worker stopped before completion.",
          logs: [{ timestamp: new Date().toISOString(), file: "", status: "error", message: "Scan timed out or worker stopped before completion." }],
        },
      })
      .in("id", staleRunningIds);

    await db
      .from("projects")
      .update({ status: "active" })
      .eq("id", projectId);
  }
}

/* ─── actions ─── */

/** Create a new scan job and immediately start processing it. */
export async function createScanJob(
  projectId: string,
  triggeredBy: "manual" | "cli" | "webhook" = "manual"
): Promise<ScanJobRow> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const db = createAdminClient();

  // Verify the project belongs to the user
  const { data: project, error: projectError } = await db
    .from("projects")
    .select("id, user_id, repo_name, branch, name")
    .eq("id", projectId)
    .eq("user_id", session.dbUser.id)
    .single();

  if (projectError || !project) throw new Error("Project not found");

  // Recover stuck scans so users are not blocked forever if a prior run died.
  await recoverStaleProjectScans(db, projectId);

  // Check for existing queued/running job
  const { data: existing } = await db
    .from("scan_jobs")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["queued", "running"])
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error("A scan is already queued or running for this project");
  }

  if (!project.repo_name) {
    throw new Error("Project has no connected repository");
  }

  // Get GitHub token — should always be in DB since getSession backfills it.
  const { data: user } = await db
    .from("users")
    .select("github_token")
    .eq("id", session.dbUser.id)
    .single();

  const githubToken = user?.github_token ?? null;

  if (!githubToken) {
    throw new Error("GitHub token expired. Please sign out and sign back in.");
  }

  // Set project status to scanning
  await db
    .from("projects")
    .update({ status: "scanning" })
    .eq("id", projectId);

  // Check global concurrency — queue if at limit
  const MAX_CONCURRENT_SCANS = 3;
  const { count: runningCount } = await db
    .from("scan_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");

  const isAtCapacity = (runningCount ?? 0) >= MAX_CONCURRENT_SCANS;

  const { data: job, error } = await db
    .from("scan_jobs")
    .insert({
      project_id: projectId,
      status: isAtCapacity ? "queued" : "running",
      triggered_by: triggeredBy,
      started_at: isAtCapacity ? null : new Date().toISOString(),
      ...(isAtCapacity
        ? {
            result: {
              _dispatch_repo: project.repo_name,
              _dispatch_branch: project.branch ?? "main",
              logs: [{ timestamp: new Date().toISOString(), file: "", status: "scanning", message: "Scan queued — waiting for an available slot" }],
            },
          }
        : {}),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (isAtCapacity) {
    // The queue processor will pick it up when a slot opens
    return job;
  }

  // Validate required env vars before dispatching
  const workerSecret = process.env.SCAN_WORKER_SECRET?.trim();
  if (!workerSecret) {
    await db.from("scan_jobs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      result: {
        error: "SCAN_WORKER_SECRET is not configured on the server.",
        logs: [{ timestamp: new Date().toISOString(), file: "", status: "error", message: "SCAN_WORKER_SECRET is not configured on the server." }],
      },
    }).eq("id", job.id);
    await db.from("projects").update({ status: "active" }).eq("id", projectId);
    throw new Error("Server misconfiguration: scan worker secret not set. Contact support.");
  }

  if (!process.env.OPENAI_API_KEY) {
    await db.from("scan_jobs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      result: {
        error: "OPENAI_API_KEY is not configured on the server.",
        logs: [{ timestamp: new Date().toISOString(), file: "", status: "error", message: "OPENAI_API_KEY is not configured on the server." }],
      },
    }).eq("id", job.id);
    await db.from("projects").update({ status: "active" }).eq("id", projectId);
    throw new Error("Server misconfiguration: OpenAI API key not set. Contact support.");
  }

  // Dispatch via Trigger.dev (or HTTP fallback for local dev)
  const { dispatchScan } = await import("@/lib/scan-dispatch");
  dispatchScan({
    scanJobId: job.id,
    projectId,
    repoName: project.repo_name,
    branch: project.branch ?? "main",
    githubToken,
  }).catch(async (err) => {
    console.error("[createScanJob] Scan dispatch failed:", err);
    const errorMsg = "Failed to start scan: " + String(err);
    const adminDb = createAdminClient();
    await adminDb.from("scan_jobs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      result: {
        error: errorMsg,
        logs: [{ timestamp: new Date().toISOString(), file: "", status: "error", message: errorMsg }],
      },
    }).eq("id", job.id).then(undefined, () => {});
    await adminDb.from("projects").update({ status: "active" }).eq("id", projectId).then(undefined, () => {});
  });

  return job;
}

/** Get scan jobs for a project. */
export async function getScanJobs(projectId: string): Promise<ScanJobRow[]> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const db = createAdminClient();

  // Verify project belongs to user
  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", session.dbUser.id)
    .single();

  if (!project) throw new Error("Project not found");

  const { data, error } = await db
    .from("scan_jobs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Get all scan jobs across a user's projects. */
export async function getAllScanJobs(): Promise<ScanJobWithProject[]> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const db = createAdminClient();

  // Get user's projects
  const { data: projects } = await db
    .from("projects")
    .select("id, name, slug")
    .eq("user_id", session.dbUser.id);

  if (!projects?.length) return [];

  const projectIds = projects.map((p) => p.id);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const { data: jobs, error } = await db
    .from("scan_jobs")
    .select("*")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (jobs ?? []).map((job) => {
    const proj = projectMap.get(job.project_id)!;
    return {
      ...job,
      project_name: proj.name,
      project_slug: proj.slug,
    };
  });
}

/** Get a single scan job by ID with auth check. */
export async function getScanJob(scanJobId: string): Promise<ScanJobWithProject | null> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const db = createAdminClient();

  const { data: job } = await db
    .from("scan_jobs")
    .select("*")
    .eq("id", scanJobId)
    .single();

  if (!job) return null;

  // Verify project belongs to user
  const { data: project } = await db
    .from("projects")
    .select("id, name, slug")
    .eq("id", job.project_id)
    .eq("user_id", session.dbUser.id)
    .single();

  if (!project) return null;

  return { ...job, project_name: project.name, project_slug: project.slug };
}

/** Get features and context entries associated with a specific scan job. */
export async function getScanFeatures(scanJobId: string) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const db = createAdminClient();

  // Get the scan job to find project_id and the stored feature_ids fallback
  const { data: job } = await db
    .from("scan_jobs")
    .select("project_id, result")
    .eq("id", scanJobId)
    .single();

  if (!job) return [];

  // Verify project belongs to user
  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("id", job.project_id)
    .eq("user_id", session.dbUser.id)
    .single();

  if (!project) return [];

  // Get context entries from this scan, scoped via metadata
  const { data: scanEntries } = await db
    .from("context_entries")
    .select("id, feature_id, content, metadata")
    .eq("entry_type", "scan")
    .eq("source", "worker")
    .filter("metadata->>scan_job_id", "eq", scanJobId);

  const entries = scanEntries ?? [];
  const featureIds = [...new Set(entries.map((e) => e.feature_id))];

  // Fallback: if no entries were created (e.g. embedding failed), use feature_ids
  // stored directly in the scan result JSONB.
  if (featureIds.length === 0) {
    const result = job.result as ScanResult | null;
    const fallbackIds = result?.feature_ids ?? [];
    if (fallbackIds.length === 0) return [];

    const { data: directFeatures } = await db
      .from("features")
      .select("*")
      .in("id", fallbackIds);

    return (directFeatures ?? []).map((f) => ({ ...f, entries: [] }));
  }

  const { data: features } = await db
    .from("features")
    .select("*")
    .in("id", featureIds);

  return (features ?? []).map((f) => {
    const fEntries = entries.filter((e) => e.feature_id === f.id);
    return {
      ...f,
      entries: fEntries.map((e) => ({
        id: e.id,
        content: e.content,
        metadata: e.metadata as Record<string, unknown>,
      })),
    };
  });
}

/** Cancel a running or queued scan job. */
export async function cancelScanJob(scanJobId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const db = createAdminClient();

  // Get the scan job
  const { data: job } = await db
    .from("scan_jobs")
    .select("id, project_id, status, result")
    .eq("id", scanJobId)
    .single();

  if (!job) throw new Error("Scan job not found");

  // Verify project belongs to user
  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("id", job.project_id)
    .eq("user_id", session.dbUser.id)
    .single();

  if (!project) throw new Error("Unauthorized");

  if (job.status !== "running" && job.status !== "queued") {
    throw new Error("Scan is not running");
  }

  // Mark cancelled (the scan runner checks for this between batches)
  await db
    .from("scan_jobs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      result: { error: "Cancelled by user" },
    })
    .eq("id", scanJobId);

  await db
    .from("projects")
    .update({ status: "active" })
    .eq("id", job.project_id);

  // Cancel the Trigger.dev run if we have a run ID
  const triggerRunId = (job.result as Record<string, unknown> | null)?._trigger_run_id;
  if (triggerRunId && typeof triggerRunId === "string" && process.env.TRIGGER_SECRET_KEY) {
    try {
      const { runs } = await import("@trigger.dev/sdk/v3");
      await runs.cancel(triggerRunId);
    } catch {
      // Non-fatal: run may have already finished or the API may be unavailable
    }
  }
}

/** Update scan configuration for a project. */
export async function updateScanConfig(
  projectId: string,
  config: { scanOnPush?: boolean },
): Promise<{ scanOnPush: boolean }> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const db = createAdminClient();

  const { data: project } = await db
    .from("projects")
    .select("id, repo_name, branch, scan_on_push, webhook_secret, github_webhook_id")
    .eq("id", projectId)
    .eq("user_id", session.dbUser.id)
    .single();

  if (!project) throw new Error("Project not found");

  // Get user's GitHub token
  const { data: user } = await db
    .from("users")
    .select("github_token")
    .eq("id", session.dbUser.id)
    .single();
  const githubToken = user?.github_token;

  const updates: Record<string, unknown> = {};

  if (config.scanOnPush !== undefined) {
    updates.scan_on_push = config.scanOnPush;

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    if (config.scanOnPush) {
      // Generate a webhook secret if we don't have one yet
      let secret = project.webhook_secret;
      if (!secret) {
        const { randomBytes } = await import("node:crypto");
        secret = randomBytes(32).toString("hex");
        updates.webhook_secret = secret;
      }

      // Auto-register the webhook on GitHub if we have a token and repo
      if (githubToken && project.repo_name && !project.github_webhook_id) {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${project.repo_name}/hooks`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: "web",
                active: true,
                events: ["push"],
                config: {
                  url: `${appUrl}/api/scan/webhook`,
                  content_type: "json",
                  secret,
                  insecure_ssl: "0",
                },
              }),
            },
          );
          if (res.ok) {
            const hook = await res.json() as { id: number };
            updates.github_webhook_id = hook.id;
          }
        } catch {
          // Non-fatal: the toggle still saves, they can retry
        }
      }
    } else {
      // Auto-delete the webhook from GitHub when disabled
      if (githubToken && project.repo_name && project.github_webhook_id) {
        try {
          await fetch(
            `https://api.github.com/repos/${project.repo_name}/hooks/${project.github_webhook_id}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
              },
            },
          );
        } catch {
          // Non-fatal
        }
      }
      updates.github_webhook_id = null;
    }
  }

  const { data, error } = await db
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .select("scan_on_push")
    .single();

  if (error) throw new Error(error.message);

  return { scanOnPush: data.scan_on_push };
}
