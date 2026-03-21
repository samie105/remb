import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/cli/events/stream?projectSlug=<slug>&since=<iso8601>
 *
 * Lightweight change-detection poll endpoint.
 * Returns a digest of the current project state so the extension
 * only fetches full data when something actually changed.
 *
 * Designed for Vercel serverless — stateless, single-request, fast.
 */
export async function GET(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const { searchParams } = new URL(request.url);
  const projectSlug = searchParams.get("projectSlug");

  if (!projectSlug) {
    return NextResponse.json({ error: "Missing projectSlug" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: project } = await db
    .from("projects")
    .select("id, status")
    .eq("slug", projectSlug)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Run lightweight counts in parallel
  const featuresP = db
    .from("features")
    .select("id")
    .eq("project_id", project.id);

  const memoriesP = db
    .from("memories")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .or(`project_id.eq.${project.id},project_id.is.null`);

  const lastScanP = db
    .from("scan_jobs")
    .select("id, status, finished_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [featuresRes, memoriesRes, lastScanRes] = await Promise.all([featuresP, memoriesP, lastScanP]);

  const featureIds = (featuresRes.data ?? []).map((f) => f.id);

  let contextCount = 0;
  if (featureIds.length > 0) {
    const { count } = await db
      .from("context_entries")
      .select("*", { count: "exact", head: true })
      .in("feature_id", featureIds);
    contextCount = count ?? 0;
  }

  // Build a simple digest string: "status|contextCount|memoryCount|lastScanId"
  // Extension compares this to its last-known digest — only fetches full data on change
  const scanId = lastScanRes.data?.id ?? "none";
  const scanStatus = lastScanRes.data?.status ?? "none";
  const memoryCount = memoriesRes.count ?? 0;
  const digest = `${project.status}|${contextCount}|${memoryCount}|${scanId}|${scanStatus}`;

  return NextResponse.json({
    digest,
    projectStatus: project.status,
    contextEntries: contextCount,
    memories: memoryCount,
    features: featureIds.length,
    lastScanId: scanId,
    lastScanStatus: scanStatus,
    lastScanFinishedAt: lastScanRes.data?.finished_at ?? null,
    timestamp: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-cache, no-store" },
  });
}
