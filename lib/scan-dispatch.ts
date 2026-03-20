import { createAdminClient } from "@/lib/supabase/server";

export interface ScanDispatchPayload {
  scanJobId: string;
  projectId: string;
  repoName: string;
  branch: string;
  githubToken: string;
}

/**
 * Dispatch a scan to Trigger.dev (preferred) or fall back to direct HTTP.
 *
 * Uses Trigger.dev when TRIGGER_SECRET_KEY is set (production).
 * Falls back to direct /api/scan/run call when it's not (local dev).
 */
export async function dispatchScan(payload: ScanDispatchPayload): Promise<void> {
  if (process.env.TRIGGER_SECRET_KEY) {
    // Trigger.dev path — reliable, retried, no Vercel timeout issues
    const { scanProjectTask } = await import("@/trigger/scan-project");
    await scanProjectTask.trigger(payload);
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
    const db = createAdminClient();
    await db.from("scan_jobs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      result: { error: `Scan worker rejected: HTTP ${res.status} — ${body.slice(0, 200)}` },
    }).eq("id", payload.scanJobId).then(undefined, () => {});
    await db.from("projects").update({ status: "active" }).eq("id", payload.projectId).then(undefined, () => {});
    throw new Error(`Scan dispatch failed: HTTP ${res.status}`);
  }
}
