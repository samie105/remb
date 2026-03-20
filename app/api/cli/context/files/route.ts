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

  // File dependency graph for dependency-aware mirror
  const { data: deps } = await db
    .from("file_dependencies")
    .select("source_path, target_path, import_type, imported_symbols")
    .eq("project_id", project.id);

  // Build imports/imported-by maps
  const fileDeps: Record<string, { imports: string[]; importedBy: string[] }> = {};
  for (const d of deps ?? []) {
    if (!fileDeps[d.source_path]) fileDeps[d.source_path] = { imports: [], importedBy: [] };
    if (!fileDeps[d.target_path]) fileDeps[d.target_path] = { imports: [], importedBy: [] };
    fileDeps[d.source_path].imports.push(d.target_path);
    fileDeps[d.target_path].importedBy.push(d.source_path);
  }

  // Fetch recent conversations for this project to associate with files
  const knownPaths = new Set(Object.keys(fileContextMap));
  const fileConversations: Record<string, Array<{
    summary: string;
    timestamp: string;
    relatedFiles: string[];
  }>> = {};

  const { data: conversations } = await db
    .from("conversation_entries")
    .select("content, metadata, created_at")
    .eq("user_id", user.id)
    .eq("project_slug", projectSlug)
    .order("created_at", { ascending: false })
    .limit(100);

  if (conversations?.length) {
    for (const conv of conversations) {
      const meta = conv.metadata as Record<string, unknown> | null;
      const filesChanged = (meta?.files_changed as string[] | undefined) ?? [];

      // Files from metadata, falling back to text matching against known paths
      const matchedFiles = new Set<string>();
      for (const fp of filesChanged) {
        if (knownPaths.has(fp)) matchedFiles.add(fp);
      }
      // Text-match fallback for entries without files_changed metadata
      if (matchedFiles.size === 0 && conv.content) {
        for (const fp of knownPaths) {
          if (conv.content.includes(fp)) matchedFiles.add(fp);
        }
      }

      if (matchedFiles.size === 0) continue;

      const allRelated = [...matchedFiles];
      for (const fp of matchedFiles) {
        if (!fileConversations[fp]) fileConversations[fp] = [];
        fileConversations[fp].push({
          summary: conv.content.slice(0, 500),
          timestamp: conv.created_at,
          relatedFiles: allRelated.filter((f) => f !== fp),
        });
      }
    }
  }

  return NextResponse.json({ files: fileContextMap, dependencies: fileDeps, conversations: fileConversations });
