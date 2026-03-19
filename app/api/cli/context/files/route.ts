import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/cli/context/files?projectSlug=<slug>
 *
 * Returns per-file context entries grouped by file path.
 * Used by the VS Code extension to mirror project structure in .remb/
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

  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", projectSlug)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get all features with context entries that have a file_path in metadata
  const { data: features } = await db
    .from("features")
    .select("id, name, description")
    .eq("project_id", project.id)
    .eq("status", "active");

  if (!features?.length) {
    return NextResponse.json({ files: {} });
  }

  const featureIds = features.map((f) => f.id);
  const featureMap = new Map(features.map((f) => [f.id, f]));

  const { data: entries } = await db
    .from("context_entries")
    .select("feature_id, content, metadata, entry_type, created_at")
    .in("feature_id", featureIds)
    .order("created_at", { ascending: false });

  // Group entries by file_path
  const fileContextMap: Record<string, Array<{
    feature: string;
    featureDescription: string | null;
    content: string;
    category: string;
    importance: number;
    entryType: string;
    tags: string[];
    updatedAt: string;
  }>> = {};

  for (const entry of entries ?? []) {
    const meta = entry.metadata as Record<string, unknown> | null;
    const filePath = meta?.file_path as string | undefined;
    if (!filePath) continue;

    const feature = featureMap.get(entry.feature_id);
    if (!feature) continue;

    if (!fileContextMap[filePath]) fileContextMap[filePath] = [];
    fileContextMap[filePath].push({
      feature: feature.name,
      featureDescription: feature.description,
      content: entry.content,
      category: (meta?.category as string) ?? "core",
      importance: (meta?.importance as number) ?? 5,
      entryType: entry.entry_type,
      tags: (meta?.tags as string[]) ?? [],
      updatedAt: entry.created_at,
    });
  }

  return NextResponse.json({ files: fileContextMap });
}
