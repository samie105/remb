/**
 * Phase 5: FINALIZE
 *
 * Marks scan as done, schedules continuation if files remain,
 * triggers queue processing.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { getInternalApiUrl, getInternalFetchHeaders } from "@/lib/utils";
import type { Json } from "@/lib/supabase/types";
import type { ScanState } from "@/lib/scan-coordinator";
import { buildFinalResult, pushLog, recordPhase } from "@/lib/scan-coordinator";

/** Maximum continuation batches. */
const MAX_CONTINUATION_PASSES = 10;

export async function runFinalizePhase(state: ScanState): Promise<void> {
  const phaseStart = Date.now();
  const db = createAdminClient();

  try {
    const result = buildFinalResult(state);

    await db
      .from("scan_jobs")
      .update({
        status: "done",
        result: result as unknown as Json,
        finished_at: new Date().toISOString(),
      })
      .eq("id", state.scanJobId);

    // Auto-continuation if files were capped
    if (state.filesRemaining > 0) {
      await scheduleContinuationScan(state);
    } else {
      await db.from("projects").update({ status: "active" }).eq("id", state.projectId);
    }

    triggerQueueProcessing();

    await pushLog(state, {
      timestamp: new Date().toISOString(),
      file: "",
      status: "done",
      message: `[FINALIZE] Scan complete: ${state.filesProcessed} files, ${state.featuresCreated} features, ${state.entriesCreated} entries in ${Math.round(result.duration_ms / 1000)}s`,
    });

    recordPhase(state, {
      phase: "finalize",
      status: "success",
      duration_ms: Date.now() - phaseStart,
      message: `Scan done in ${Math.round(result.duration_ms / 1000)}s`,
      stats: {
        total_duration_ms: result.duration_ms,
        files_remaining: state.filesRemaining,
      },
    });
  } catch (err) {
    recordPhase(state, {
      phase: "finalize",
      status: "failed",
      duration_ms: Date.now() - phaseStart,
      message: err instanceof Error ? err.message : "Finalize failed",
    });
    throw err;
  }
}

async function scheduleContinuationScan(state: ScanState): Promise<void> {
  const db = createAdminClient();

  try {
    // Count continuation passes in chain
    let passCount = 0;
    let currentJobId = state.scanJobId;
    while (passCount < MAX_CONTINUATION_PASSES) {
      const { data: job } = await db
        .from("scan_jobs")
        .select("result")
        .eq("id", currentJobId)
        .single();
      const meta = job?.result as Record<string, unknown> | null;
      const prevId = meta?._continuation_of as string | undefined;
      if (!prevId) break;
      currentJobId = prevId;
      passCount++;
    }

    if (passCount >= MAX_CONTINUATION_PASSES) {
      state.logs.push({
        timestamp: new Date().toISOString(),
        file: "",
        status: "skipped",
        message: `Reached max continuation batches (${MAX_CONTINUATION_PASSES}).`,
      });
      await db.from("projects").update({ status: "active" }).eq("id", state.projectId);
      return;
    }

    const { error } = await db
      .from("scan_jobs")
      .insert({
        project_id: state.projectId,
        status: "queued" as const,
        triggered_by: "webhook" as const,
        result: {
          _continuation_of: state.scanJobId,
          _chain_id: state.chainId,
          _pass_number: passCount + 2,
          _dispatch_repo: state.repoName,
          _dispatch_branch: state.branch,
          logs: [{
            timestamp: new Date().toISOString(),
            file: "",
            status: "scanning",
            message: `Continuation scan (batch ${passCount + 2}) queued`,
          }],
        },
      })
      .select()
      .single();

    if (error) {
      await db.from("projects").update({ status: "active" }).eq("id", state.projectId);
      return;
    }

    triggerQueueProcessing();
  } catch {
    await db.from("projects").update({ status: "active" }).eq("id", state.projectId);
  }
}

function triggerQueueProcessing() {
  const appUrl = getInternalApiUrl();
  const secret = process.env.SCAN_WORKER_SECRET?.trim();
  if (!secret) return;

  fetch(`${appUrl}/api/scan/process-queue`, {
    method: "POST",
    headers: getInternalFetchHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    }),
  }).catch(() => { /* fire and forget */ });
}
