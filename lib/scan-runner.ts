/**
 * Core scan pipeline. Orchestrates multi-agent scanning through 5 phases:
 *
 *   1. SCOUT    — File tree fetch, smart-scan dedup, tarball download, import graph
 *   2. ANALYZE  — Parallel AI extraction → code_nodes / code_edges / features
 *   3. ARCHITECT — LLM architecture analysis → semantic layers, cross-cutting concerns
 *   4. REVIEW   — Graph validation, edge resolution, quality gate
 *   5. FINALIZE — Mark done, continuation scheduling
 *
 * Each phase is a self-contained module in lib/scan-phases/. The coordinator
 * (lib/scan-coordinator.ts) manages shared state passed between phases.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { getInternalApiUrl, getInternalFetchHeaders } from "@/lib/utils";
import type { Json } from "@/lib/supabase/types";
import type { ScanLogEntry, ScanResult } from "@/lib/scan-actions";
import { createScanState, buildFinalResult } from "@/lib/scan-coordinator";
import {
  runScoutPhase,
  runAnalyzePhase,
  runArchitectPhase,
  runReviewPhase,
  runFinalizePhase,
} from "@/lib/scan-phases";

export async function runScan(
  scanJobId: string,
  projectId: string,
  repoName: string,
  branch: string,
  githubToken: string,
): Promise<ScanResult> {
  const db = createAdminClient();

  // ── Fail-fast: validate required env vars ──
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Cannot extract features without an OpenAI API key.",
    );
  }

  // ── Chain tracking ──
  const { data: jobMetaRow } = await db.from("scan_jobs").select("result").eq("id", scanJobId).single();
  const existingMeta = jobMetaRow?.result as Record<string, unknown> | null;
  const chainId = (existingMeta?._chain_id as string) ?? scanJobId;
  const batchNumber = (existingMeta?._pass_number as number) ?? 1;

  // ── Create coordinator state ──
  const state = createScanState(
    scanJobId,
    projectId,
    repoName,
    branch,
    githubToken,
    chainId,
    batchNumber,
  );

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 1: SCOUT — File tree, downloads, import graph
    // ═══════════════════════════════════════════════════════════════════════════
    await runScoutPhase(state);

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 2: ANALYZE — Parallel AI extraction
    // ═══════════════════════════════════════════════════════════════════════════
    await runAnalyzePhase(state);

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 3: ARCHITECT — LLM architecture analysis
    // ═══════════════════════════════════════════════════════════════════════════
    await runArchitectPhase(state);

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 4: REVIEW — Edge resolution, graph validation, quality gate
    // ═══════════════════════════════════════════════════════════════════════════
    await runReviewPhase(state);

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase 5: FINALIZE — Mark done, continuation
    // ═══════════════════════════════════════════════════════════════════════════
    await runFinalizePhase(state);

    return buildFinalResult(state);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    state.logs.push({
      timestamp: new Date().toISOString(),
      file: "",
      status: "error" as const,
      message: `Scan failed: ${errorMsg}`,
    });

    await db
      .from("scan_jobs")
      .update({
        status: "failed",
        result: {
          error: errorMsg,
          files_total: state.filesTotal,
          files_scanned: state.filesProcessed,
          features_created: state.featuresCreated,
          entries_created: state.entriesCreated,
          errors: state.errors + 1,
          duration_ms: Date.now() - state.scanStartMs,
          logs: state.logs,
          tech_stack: [...state.techStack],
          languages: state.languages,
          phases: state.phaseResults,
        } as unknown as Json,
        finished_at: new Date().toISOString(),
      })
      .eq("id", state.scanJobId);

    await db.from("projects").update({ status: "active" }).eq("id", projectId);

    // Trigger queue processing even on failure
    triggerQueueProcessing();

    throw err;
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
