import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInternalApiUrl, getInternalFetchHeaders } from "@/lib/utils";
import { runScan } from "@/lib/scan-runner";
import { timingSafeEqual, createHmac } from "node:crypto";

export const maxDuration = 300;

/**
 * POST /api/scan/webhook
 *
 * GitHub push webhook endpoint. When a user pushes to a repo that has
 * scan_on_push enabled, GitHub sends a POST here and we auto-trigger a scan.
 *
 * The webhook secret stored per-project is used to verify the payload
 * signature (X-Hub-Signature-256).
 */
export async function POST(request: NextRequest) {
  const event = request.headers.get("x-github-event");
  if (event === "ping") {
    return NextResponse.json({ ok: true, message: "pong" });
  }
  if (event !== "push") {
    return NextResponse.json({ ok: true, message: "ignored" });
  }

  let body: {
    ref?: string;
    repository?: { full_name?: string };
    head_commit?: { id?: string };
  };
  const rawBody = await request.text();

  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoName = body.repository?.full_name;
  if (!repoName) {
    return NextResponse.json({ error: "Missing repository info" }, { status: 400 });
  }

  const db = createAdminClient();

  // Find projects for this repo that have scan_on_push enabled
  const { data: projects } = await db
    .from("projects")
    .select("id, user_id, repo_name, branch, webhook_secret")
    .eq("repo_name", repoName)
    .eq("scan_on_push", true);

  if (!projects?.length) {
    return NextResponse.json({ ok: true, message: "no matching projects" });
  }

  // The ref from GitHub looks like "refs/heads/main"
  const pushedBranch = body.ref?.replace("refs/heads/", "") ?? "";

  const results: Array<{ projectId: string; status: string }> = [];

  for (const project of projects) {
    // Only trigger for the configured branch
    if (pushedBranch !== (project.branch ?? "main")) {
      results.push({ projectId: project.id, status: "branch_mismatch" });
      continue;
    }

    // Verify webhook signature if project has a secret
    if (project.webhook_secret) {
      const signature = request.headers.get("x-hub-signature-256");
      if (!signature || !verifySignature(rawBody, project.webhook_secret, signature)) {
        results.push({ projectId: project.id, status: "invalid_signature" });
        continue;
      }
    }

    // Check for existing running/queued scan
    const { data: existing } = await db
      .from("scan_jobs")
      .select("id")
      .eq("project_id", project.id)
      .in("status", ["queued", "running"])
      .limit(1);

    if (existing && existing.length > 0) {
      results.push({ projectId: project.id, status: "already_running" });
      continue;
    }

    // Get user's GitHub token
    const { data: user } = await db
      .from("users")
      .select("github_token")
      .eq("id", project.user_id)
      .single();

    if (!user?.github_token) {
      results.push({ projectId: project.id, status: "no_github_token" });
      continue;
    }

    // Set project status to scanning
    await db.from("projects").update({ status: "scanning" }).eq("id", project.id);

    // Create scan job
    const { data: job, error } = await db
      .from("scan_jobs")
      .insert({
        project_id: project.id,
        status: "running",
        triggered_by: "webhook",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !job) {
      results.push({ projectId: project.id, status: "create_failed" });
      continue;
    }

    // Dispatch scan worker (fire-and-forget)
    const appUrl = getInternalApiUrl();

    fetch(`${appUrl}/api/scan/run`, {
      method: "POST",
      headers: getInternalFetchHeaders({
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SCAN_WORKER_SECRET?.trim()}`,
      }),
      body: JSON.stringify({
        scanJobId: job.id,
        projectId: project.id,
        repoName: project.repo_name,
        branch: project.branch ?? "main",
        githubToken: user.github_token,
      }),
    }).catch((err) => {
      console.error("[webhook] Failed to dispatch scan worker:", err);
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

    results.push({ projectId: project.id, status: "scan_started" });
  }

  return NextResponse.json({ ok: true, results });
}

function verifySignature(payload: string, secret: string, signatureHeader: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
