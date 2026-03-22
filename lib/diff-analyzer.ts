"use server";

/**
 * Diff impact analysis engine.
 * Maps git diffs to code graph impact — identifies affected nodes,
 * edges, layers, and memories. Inspired by UA's diff-analyzer pattern.
 */

import { createAdminClient } from "@/lib/supabase/server";

/* ─── types ─── */

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}

export interface AffectedNode {
  id: string;
  name: string;
  node_type: string;
  file_path: string;
  summary: string;
  layer: string | null;
  impact: "direct" | "downstream";
}

export interface DiffImpact {
  changedFiles: DiffFile[];
  directNodes: AffectedNode[];
  downstreamNodes: AffectedNode[];
  affectedLayers: string[];
  affectedEdgeCount: number;
  riskLevel: "low" | "medium" | "high";
  riskFactors: string[];
  summary: string;
}

/* ─── core ─── */

/**
 * Analyze the impact of changed files against the code graph.
 * Returns affected nodes (direct + 1-hop downstream), layers, and risk assessment.
 */
export async function analyzeDiffImpact(
  projectId: string,
  changedFiles: DiffFile[],
): Promise<DiffImpact> {
  const db = createAdminClient();
  const changedPaths = changedFiles.map((f) => f.path);

  // 1. Find directly affected nodes (nodes in changed files)
  const { data: directRows } = await db
    .from("code_nodes" as never)
    .select("id, name, node_type, file_path, summary, layer" as never)
    .eq("project_id", projectId)
    .in("file_path", changedPaths);

  const directNodes: AffectedNode[] = ((directRows ?? []) as unknown as Array<{
    id: string; name: string; node_type: string; file_path: string; summary: string; layer: string | null;
  }>).map((n) => ({ ...n, impact: "direct" as const }));

  const directNodeIds = new Set(directNodes.map((n) => n.id));

  // 2. Find 1-hop downstream nodes (nodes that depend on changed nodes)
  const downstreamNodes: AffectedNode[] = [];
  if (directNodeIds.size > 0) {
    // Find edges where changed nodes are the target (i.e., things that call/import changed code)
    const { data: downstreamEdges } = await db
      .from("code_edges" as never)
      .select("source_node_name, source_file" as never)
      .eq("project_id", projectId)
      .in("target_file", changedPaths);

    const downstreamFiles = new Set(
      ((downstreamEdges ?? []) as unknown as Array<{ source_file: string }>)
        .map((e) => e.source_file)
        .filter((f) => !changedPaths.includes(f)),
    );

    if (downstreamFiles.size > 0) {
      const { data: downstreamRows } = await db
        .from("code_nodes" as never)
        .select("id, name, node_type, file_path, summary, layer" as never)
        .eq("project_id", projectId)
        .eq("node_type", "file")
        .in("file_path", Array.from(downstreamFiles).slice(0, 50));

      for (const n of (downstreamRows ?? []) as unknown as Array<{
        id: string; name: string; node_type: string; file_path: string; summary: string; layer: string | null;
      }>) {
        if (!directNodeIds.has(n.id)) {
          downstreamNodes.push({ ...n, impact: "downstream" });
        }
      }
    }
  }

  // 3. Identify affected layers
  const allNodes = [...directNodes, ...downstreamNodes];
  const affectedLayers = [...new Set(allNodes.map((n) => n.layer).filter(Boolean) as string[])];

  // 4. Count affected edges
  const { count: affectedEdgeCount } = await db
    .from("code_edges" as never)
    .select("id" as never, { count: "exact", head: true })
    .eq("project_id", projectId)
    .or(`source_file.in.(${changedPaths.join(",")}),target_file.in.(${changedPaths.join(",")})` as never);

  // 5. Risk assessment
  const riskFactors: string[] = [];

  const totalChanges = changedFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  if (totalChanges > 500) riskFactors.push(`Large change volume (${totalChanges} lines)`);
  if (changedFiles.some((f) => f.status === "deleted")) riskFactors.push("Files deleted");
  if (affectedLayers.length > 2) riskFactors.push(`Cross-layer impact (${affectedLayers.length} layers)`);
  if (downstreamNodes.length > 10) riskFactors.push(`High blast radius (${downstreamNodes.length} downstream files)`);
  if (directNodes.some((n) => n.node_type === "class" || n.node_type === "type")) {
    riskFactors.push("Type/class changes may break contracts");
  }

  const complexNodes = directNodes.filter((n) => {
    // This is a rough heuristic — complex nodes are higher risk
    return n.node_type === "class" || n.node_type === "hook";
  });
  if (complexNodes.length > 3) riskFactors.push(`${complexNodes.length} complex symbols affected`);

  let riskLevel: "low" | "medium" | "high" = "low";
  if (riskFactors.length >= 3 || downstreamNodes.length > 15) riskLevel = "high";
  else if (riskFactors.length >= 1 || downstreamNodes.length > 5) riskLevel = "medium";

  // 6. Generate summary
  const summary = [
    `${changedFiles.length} files changed → ${directNodes.length} nodes directly affected`,
    downstreamNodes.length > 0 ? `${downstreamNodes.length} downstream nodes impacted` : null,
    affectedLayers.length > 0 ? `Layers: ${affectedLayers.join(", ")}` : null,
    `Risk: ${riskLevel}${riskFactors.length > 0 ? ` (${riskFactors.join("; ")})` : ""}`,
  ].filter(Boolean).join(". ");

  return {
    changedFiles,
    directNodes,
    downstreamNodes,
    affectedLayers,
    affectedEdgeCount: affectedEdgeCount ?? 0,
    riskLevel,
    riskFactors,
    summary,
  };
}

/**
 * Find memories that may be invalidated by changed files.
 * Returns memory IDs that reference features affected by the diff.
 */
export async function findAffectedMemories(
  projectId: string,
  userId: string,
  changedPaths: string[],
): Promise<Array<{ id: string; title: string; reason: string }>> {
  const db = createAdminClient();

  // Find features associated with changed files
  const { data: featureRows } = await db
    .from("features")
    .select("id")
    .eq("project_id", projectId);

  const featureIds = (featureRows ?? []).map((f) => f.id);
  if (featureIds.length === 0) return [];

  const { data: entries } = await db
    .from("context_entries")
    .select("feature_id, metadata")
    .in("feature_id", featureIds);

  const affectedFeatureIds = new Set<string>();
  for (const entry of (entries ?? [])) {
    const meta = entry.metadata as Record<string, unknown> | null;
    const filePath = meta?.file_path as string | undefined;
    if (filePath && changedPaths.includes(filePath)) {
      affectedFeatureIds.add(entry.feature_id);
    }
  }

  if (affectedFeatureIds.size === 0) return [];

  // Find memories that reference affected features (via content search)
  const { data: featureNames } = await db
    .from("features")
    .select("name")
    .in("id", Array.from(affectedFeatureIds));

  const names = (featureNames ?? []).map((f) => f.name);
  if (names.length === 0) return [];

  // Search memories for references to affected feature names
  const { data: memories } = await db
    .from("memories")
    .select("id, title, content")
    .eq("user_id", userId)
    .or(`project_id.eq.${projectId},project_id.is.null`);

  const affected: Array<{ id: string; title: string; reason: string }> = [];
  for (const mem of (memories ?? [])) {
    const contentLower = mem.content.toLowerCase();
    for (const name of names) {
      if (contentLower.includes(name.toLowerCase())) {
        affected.push({
          id: mem.id,
          title: mem.title,
          reason: `References "${name}" which has changed files`,
        });
        break;
      }
    }
  }

  return affected;
}
