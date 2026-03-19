import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/cli/session/start?projectSlug=<slug>
 *
 * Unified session-start endpoint. Returns everything an AI client needs
 * in a single API call:
 *   - Context bundle (memories + features + markdown)
 *   - Recent conversations
 *   - Last scan info
 *   - Changed files count since last scan
 *
 * Replaces 3-4 separate calls: context/bundle + conversations + sync-status + memory/load
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const projectSlug = request.nextUrl.searchParams.get("projectSlug");
  if (!projectSlug) {
    return NextResponse.json(
      { error: "Missing required query param: projectSlug" },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Resolve project
  const { data: project } = await db
    .from("projects")
    .select("id, name, description, repo_name, branch")
    .eq("user_id", user.id)
    .eq("slug", projectSlug)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Run all DB queries in parallel for speed
  const [
    scanResult,
    memoriesResult,
    featuresResult,
    conversationsResult,
  ] = await Promise.all([
    // Latest scan
    db.from("scan_jobs")
      .select("result, created_at, finished_at")
      .eq("project_id", project.id)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),

    // Memories (core + active)
    db.from("memories")
      .select("tier, category, title, content")
      .eq("user_id", user.id)
      .or(`project_id.eq.${project.id},project_id.is.null`)
      .in("tier", ["core", "active"])
      .order("tier")
      .order("access_count", { ascending: false })
      .limit(50),

    // Features + context entries
    db.from("features")
      .select("id, name, description, status")
      .eq("project_id", project.id)
      .eq("status", "active"),

    // Recent conversations
    db.from("conversation_entries")
      .select("content, type, tags, created_at")
      .eq("user_id", user.id)
      .or(`project_slug.eq.${projectSlug},project_slug.is.null`)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const latestScan = scanResult.data;
  const scanMeta = latestScan?.result as Record<string, unknown> | null;
  const techStack = Array.isArray(scanMeta?.tech_stack)
    ? (scanMeta.tech_stack as string[])
    : [];
  const languages = (scanMeta?.languages ?? {}) as Record<string, number>;
  const lastScanAt = latestScan?.finished_at ?? latestScan?.created_at ?? null;
  const lastScannedSha = (scanMeta?.commit_sha as string) ?? null;

  const memories = memoriesResult.data ?? [];
  const features = featuresResult.data ?? [];

  // Get context entries for feature aggregation
  const featureIds = features.map((f) => f.id);
  const { data: entries } = featureIds.length > 0
    ? await db
        .from("context_entries")
        .select("feature_id, metadata")
        .in("feature_id", featureIds)
    : { data: [] as { feature_id: string; metadata: unknown }[] };

  // Build feature summaries
  type FeatureCategory = "core" | "ui" | "data" | "infra" | "integration";
  const featureSummaries = features.map((f) => {
    const fEntries = (entries ?? []).filter((e) => e.feature_id === f.id);
    const files: string[] = [];
    const categoryCounts = new Map<string, number>();
    const importanceValues: number[] = [];

    for (const e of fEntries) {
      const meta = e.metadata as Record<string, unknown> | null;
      if (meta?.file_path) files.push(meta.file_path as string);
      if (meta?.category) {
        const c = meta.category as string;
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
      if (typeof meta?.importance === "number")
        importanceValues.push(meta.importance);
    }

    let category: FeatureCategory = "core";
    let maxVotes = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxVotes || (count === maxVotes && cat !== "core")) {
        category = cat as FeatureCategory;
        maxVotes = count;
      }
    }

    return {
      name: f.name,
      category,
      importance: importanceValues.length
        ? Math.round(
            importanceValues.reduce((s, v) => s + v, 0) /
              importanceValues.length,
          )
        : 5,
      description: f.description,
      files: [...new Set(files)],
    };
  })
    .filter((f) => f.importance >= 3)
    .sort((a, b) => b.importance - a.importance);

  const conversations = (conversationsResult.data ?? []).map((c) => ({
    content: c.content,
    type: c.type,
    tags: c.tags,
    createdAt: c.created_at,
  }));

  return NextResponse.json({
    project: {
      name: project.name,
      description: project.description,
      techStack,
      languages,
    },
    memories: memories.map((m) => ({
      tier: m.tier,
      category: m.category,
      title: m.title,
      content: m.content,
    })),
    features: featureSummaries,
    conversations,
    lastScanAt,
    lastScannedSha,
  });
}
