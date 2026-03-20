import { task, logger } from "@trigger.dev/sdk/v3";
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
  // 10 min — Trigger.dev allows much longer than Vercel's 800s
  maxDuration: 600,
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
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
      // runScan already marked the job "failed" in DB before throwing
      logger.error("Scan pipeline failed", {
        scanJobId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // Let Trigger.dev handle retry
    }
  },
});
