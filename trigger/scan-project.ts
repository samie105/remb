import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { runScan } from "@/lib/scan-runner";
import { createAdminClient } from "@/lib/supabase/server";

export interface ScanProjectPayload {
  scanJobId: string;
  projectId: string;
  repoName: string;
  branch: string;
  githubToken: string;
}

/**
 * Trigger.dev task: scan a GitHub project.
 *
 * Replaces the old fire-and-forget fetch to /api/scan/run.
 * Runs on Trigger.dev's cloud — no Vercel timeout or deployment protection issues.
 */
export const scanProjectTask = task({
  id: "scan-project",
  // Defaults — overridden per-run by dispatch based on project size
  maxDuration: 600,
  machine: "medium-2x",
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  onFailure: async ({ payload, error }) => {
    // Ensure DB is cleaned up even if the task is cancelled/killed by Trigger.dev
    const { scanJobId, projectId } = payload as ScanProjectPayload;
    const db = createAdminClient();

    const { data: job } = await db
      .from("scan_jobs")
      .select("status, result")
      .eq("id", scanJobId)
      .single();

    // Only update if still in running state (avoid overriding user cancel)
    if (job?.status === "running") {
      const existing = (job.result as Record<string, unknown>) ?? {};
      const existingLogs = Array.isArray(existing.logs) ? existing.logs : [];
      const errorMsg = error instanceof Error ? error.message : "Task killed by worker";

      // Append an error entry so the build log always shows what went wrong
      const errorLogEntry = {
        timestamp: new Date().toISOString(),
        file: "",
        status: "error",
        message: `Scan failed: ${errorMsg}`,
      };

      await db
        .from("scan_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          result: {
            ...existing,
            error: errorMsg,
            logs: [...existingLogs, errorLogEntry],
          },
        })
        .eq("id", scanJobId);

      await db.from("projects").update({ status: "active" }).eq("id", projectId);
    }
  },
  run: async (payload: ScanProjectPayload) => {
    const { scanJobId, projectId, repoName, branch, githubToken } = payload;

    logger.info("Starting scan", { scanJobId, projectId, repoName, branch });

    // Verify the scan job is still in "running" state
    const db = createAdminClient();
    const { data: job } = await db
      .from("scan_jobs")
      .select("id, status")
      .eq("id", scanJobId)
      .single();

    if (!job) {
      logger.error("Scan job not found", { scanJobId });
      return { ok: false, error: "Scan job not found" };
    }

    if (job.status !== "running") {
      logger.warn("Scan job not in running state", { scanJobId, status: job.status });
      return { ok: false, error: `Scan job already in status: ${job.status}` };
    }

    try {
      const result = await runScan(scanJobId, projectId, repoName, branch, githubToken);
      logger.info("Scan completed", {
        scanJobId,
        filesScanned: result.files_scanned,
        featuresCreated: result.features_created,
      });
      return { ok: true, files_scanned: result.files_scanned };
    } catch (err) {
      // If the run was aborted by Trigger.dev (e.g. runs.cancel()), clean up gracefully
      if (err instanceof AbortTaskRunError) {
        logger.warn("Scan task aborted", { scanJobId });
        const abortDb = createAdminClient();
        const { data: abortJob } = await abortDb
          .from("scan_jobs")
          .select("status")
          .eq("id", scanJobId)
          .single();
        if (abortJob?.status === "running") {
          await abortDb.from("scan_jobs").update({
            status: "failed",
            finished_at: new Date().toISOString(),
            result: { error: "Scan cancelled" },
          }).eq("id", scanJobId);
          await abortDb.from("projects").update({ status: "active" }).eq("id", projectId);
        }
        return { ok: false, error: "Scan cancelled" };
      }

      // runScan already marked the job "failed" in DB before throwing
      logger.error("Scan pipeline failed", {
        scanJobId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // Let Trigger.dev handle retry
    }
  },
});
