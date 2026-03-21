import { createAdminClient } from "@/lib/supabase/server";

export interface ScanDispatchPayload {
  scanJobId: string;
  projectId: string;
  repoName: string;
  branch: string;
  githubToken: string;
}

/**
 * Estimate project size to pick the right Trigger.dev machine + duration.
 * Uses the Git Trees API (free, fast, returns file count + sizes + SHAs).
 */
async function estimateProjectSize(
  token: string,
  repoName: string,
  branch: string,
): Promise<{ fileCount: number; totalSizeKB: number; fileShas: Set<string> }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return { fileCount: 100, totalSizeKB: 500, fileShas: new Set() };

    const data = (await res.json()) as { tree: Array<{ type: string; size?: number; sha?: string }> };
    const blobs = data.tree.filter((i) => i.type === "blob" && (i.size ?? 0) < 100_000);
    const totalSize = blobs.reduce((sum, i) => sum + (i.size ?? 0), 0);
    const fileShas = new Set(blobs.map((b) => b.sha).filter((s): s is string => !!s));
    return { fileCount: blobs.length, totalSizeKB: Math.round(totalSize / 1024), fileShas };
  } catch {
    return { fileCount: 100, totalSizeKB: 500, fileShas: new Set() };
  }
}

/**
 * Smart-scan pre-check: compare file SHAs from the current tree against
 * previously scanned entries to determine how many files actually changed.
 * Returns the changed file count, or null if no previous scan data exists (first scan).
 */
async function getChangedFileCount(
  projectId: string,
  currentShas: Set<string>,
): Promise<number | null> {
  if (currentShas.size === 0) return null;

  const db = createAdminClient();

  const { data: features } = await db
    .from("features")
    .select("id")
    .eq("project_id", projectId);

  if (!features?.length) return null; // First scan — no previous data

  const { data: entries } = await db
    .from("context_entries")
    .select("metadata")
    .in("feature_id", features.map((f) => f.id))
    .eq("entry_type", "scan")
    .eq("source", "worker");

  if (!entries?.length) return null;

  const prevShas = new Set<string>();
  for (const e of entries) {
    const sha = (e.metadata as Record<string, unknown> | null)?.file_sha;
    if (typeof sha === "string") prevShas.add(sha);
  }

  let changedCount = 0;
  for (const sha of currentShas) {
    if (!prevShas.has(sha)) changedCount++;
  }

  return changedCount;
}

type MachinePreset = "small-1x" | "small-2x" | "medium-1x" | "medium-2x" | "large-1x" | "large-2x";

/**
 * Pick machine size + maxDuration based on estimated file count.
 *
 * Batches are capped at 100 files, so medium-2x is the max needed.
 * Smaller repos get smaller machines to save resources.
 *
 * Strategy:
 * - ≤50 files: small machine, 4 min
 * - >50 files: medium machine, 6 min
 */
function pickMachineConfig(fileCount: number): { machine: MachinePreset; maxDuration: number } {
  if (fileCount <= 50) return { machine: "small-2x", maxDuration: 240 };
  return { machine: "medium-2x", maxDuration: 360 };
}

/**
 * Dispatch a scan to Trigger.dev (preferred) or fall back to direct HTTP.
 *
 * Uses Trigger.dev when TRIGGER_SECRET_KEY is set (production).
 * Falls back to direct /api/scan/run call when it's not (local dev).
 */
export async function dispatchScan(payload: ScanDispatchPayload): Promise<void> {
  if (process.env.TRIGGER_SECRET_KEY) {
    // Estimate project size + get file SHAs for smart-scan pre-check
    const size = await estimateProjectSize(payload.githubToken, payload.repoName, payload.branch);

    // Smart-scan: compare current SHAs against previous scan to find changed files
    const changedCount = await getChangedFileCount(payload.projectId, size.fileShas);
    const isSmartScan = changedCount !== null;
    const effectiveCount = changedCount ?? size.fileCount; // null = first scan, use total
    const { machine, maxDuration } = pickMachineConfig(effectiveCount);

    // Trigger.dev path — reliable, retried, no Vercel timeout issues
    const { scanProjectTask } = await import("@/trigger/scan-project");
    const handle = await scanProjectTask.trigger(payload, {
      machine,
      maxDuration,
    });

    // Store the Trigger.dev run ID + sizing info so we can cancel/debug later
    if (handle?.id) {
      const db = createAdminClient();
      const smartScanMsg = isSmartScan
        ? `Smart scan: ${changedCount} changed files out of ${size.fileCount} total`
        : `Full scan: ${size.fileCount} files`;
      await db
        .from("scan_jobs")
        .update({
          result: {
            _trigger_run_id: handle.id,
            _dispatch_repo: payload.repoName,
            _dispatch_branch: payload.branch,
            _machine: machine,
            _max_duration: maxDuration,
            _estimated_files: size.fileCount,
            _estimated_changed_files: changedCount,
            _estimated_size_kb: size.totalSizeKB,
            _is_smart_scan: isSmartScan,
            logs: [{ timestamp: new Date().toISOString(), file: "", status: "scanning", message: `Scan dispatched to ${machine} worker — ${smartScanMsg} (~${size.totalSizeKB}KB)` }],
          },
        })
        .eq("id", payload.scanJobId)
        .then(undefined, () => {});
    }

    return;
  }

  // Fallback: direct HTTP call (for local dev or when Trigger.dev is not configured)
  const { getInternalApiUrl, getInternalFetchHeaders } = await import("@/lib/utils");
  const appUrl = getInternalApiUrl();
  const secret = process.env.SCAN_WORKER_SECRET?.trim();

  if (!secret) {
    throw new Error("Neither TRIGGER_SECRET_KEY nor SCAN_WORKER_SECRET is configured");
  }

  const res = await fetch(`${appUrl}/api/scan/run`, {
    method: "POST",
    headers: getInternalFetchHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const errorMsg = `Scan worker rejected: HTTP ${res.status} — ${body.slice(0, 200)}`;
    const db = createAdminClient();
    await db.from("scan_jobs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      result: {
        error: errorMsg,
        logs: [{ timestamp: new Date().toISOString(), file: "", status: "error", message: errorMsg }],
      },
    }).eq("id", payload.scanJobId).then(undefined, () => {});
    await db.from("projects").update({ status: "active" }).eq("id", payload.projectId).then(undefined, () => {});
    throw new Error(`Scan dispatch failed: HTTP ${res.status}`);
  }
}
