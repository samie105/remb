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
 * Uses the Git Trees API (free, fast, returns file count + sizes).
 */
async function estimateProjectSize(
  token: string,
  repoName: string,
  branch: string,
): Promise<{ fileCount: number; totalSizeKB: number }> {
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
    if (!res.ok) return { fileCount: 100, totalSizeKB: 500 }; // default

    const data = (await res.json()) as { tree: Array<{ type: string; size?: number }> };
    const blobs = data.tree.filter((i) => i.type === "blob" && (i.size ?? 0) < 100_000);
    const totalSize = blobs.reduce((sum, i) => sum + (i.size ?? 0), 0);
    return { fileCount: blobs.length, totalSizeKB: Math.round(totalSize / 1024) };
  } catch {
    return { fileCount: 100, totalSizeKB: 500 };
  }
}

type MachinePreset = "small-1x" | "small-2x" | "medium-1x" | "medium-2x" | "large-1x" | "large-2x";

/**
 * Pick machine size + maxDuration based on estimated project size.
 *
 * Strategy:
 * - Small repos (<100 files): small machine, 5 min
 * - Medium repos (100-300 files): medium machine, 8 min
 * - Large repos (300+ files): large machine, 15 min
 */
function pickMachineConfig(fileCount: number): { machine: MachinePreset; maxDuration: number } {
  if (fileCount <= 100) return { machine: "small-2x", maxDuration: 300 };
  if (fileCount <= 300) return { machine: "medium-2x", maxDuration: 480 };
  return { machine: "large-2x", maxDuration: 900 };
}

/**
 * Dispatch a scan to Trigger.dev (preferred) or fall back to direct HTTP.
 *
 * Uses Trigger.dev when TRIGGER_SECRET_KEY is set (production).
 * Falls back to direct /api/scan/run call when it's not (local dev).
 */
export async function dispatchScan(payload: ScanDispatchPayload): Promise<void> {
  if (process.env.TRIGGER_SECRET_KEY) {
    // Estimate project size to pick the right machine
    const size = await estimateProjectSize(payload.githubToken, payload.repoName, payload.branch);
    const { machine, maxDuration } = pickMachineConfig(size.fileCount);

    // Trigger.dev path — reliable, retried, no Vercel timeout issues
    const { scanProjectTask } = await import("@/trigger/scan-project");
    const handle = await scanProjectTask.trigger(payload, {
      machine,
      maxDuration,
    });

    // Store the Trigger.dev run ID + sizing info so we can cancel/debug later
    if (handle?.id) {
      const db = createAdminClient();
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
            _estimated_size_kb: size.totalSizeKB,
            logs: [{ timestamp: new Date().toISOString(), file: "", status: "scanning", message: `Scan dispatched to ${machine} worker (${size.fileCount} files, ~${size.totalSizeKB}KB)` }],
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
