/**
 * Phase 4: REVIEW
 *
 * Graph validation, edge resolution, quality assessment.
 * Resolves name-based edges to UUIDs, runs SQL validation,
 * then optionally uses LLM for quality review.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { reviewGraph } from "@/lib/openai";
import type { ScanState } from "@/lib/scan-coordinator";
import { pushLog, recordPhase } from "@/lib/scan-coordinator";

export async function runReviewPhase(state: ScanState): Promise<void> {
  const phaseStart = Date.now();
  const db = createAdminClient();

  try {
    await pushLog(state, {
      timestamp: new Date().toISOString(),
      file: "",
      status: "scanning",
      message: "[REVIEW] Resolving edges and validating graph...",
    });

    // 1. Resolve name-based edges to node UUIDs
    let resolvedCount = 0;
    try {
      const { data } = await db.rpc("resolve_code_edges" as never, {
        p_project_id: state.projectId,
      } as never);
      resolvedCount = (data as unknown as number) ?? 0;
    } catch { /* non-fatal */ }

    // 2. Run SQL-level validation
    let validationResult: Record<string, unknown> | null = null;
    try {
      const { data: validation } = await db.rpc("validate_code_graph" as never, {
        p_project_id: state.projectId,
      } as never);
      validationResult = validation as unknown as Record<string, unknown> | null;
    } catch { /* non-fatal */ }

    if (validationResult) {
      await pushLog(state, {
        timestamp: new Date().toISOString(),
        file: "",
        status: "done",
        message: `[REVIEW] SQL validation: ${validationResult.total_nodes} nodes, ${validationResult.total_edges} edges, ${validationResult.total_layers} layers. Resolved ${resolvedCount} refs. Status: ${validationResult.decision}`,
      });
    }

    // 3. Build entity relations from import graph
    try {
      const { data: projectOwner } = await db
        .from("projects")
        .select("user_id")
        .eq("id", state.projectId)
        .single();

      if (projectOwner?.user_id && state.fileToFeatureId.size > 0) {
        const userId = projectOwner.user_id;
        const relationRows: Array<{
          project_id: string;
          user_id: string;
          source_type: string;
          source_id: string;
          target_type: string;
          target_id: string;
          relation: string;
          confidence: number;
          metadata: Record<string, unknown>;
        }> = [];

        const seenRelations = new Set<string>();
        for (const [sourcePath, targets] of state.importGraph) {
          const sourceFeatureId = state.fileToFeatureId.get(sourcePath);
          if (!sourceFeatureId) continue;

          for (const targetPath of targets) {
            const targetFeatureId = state.fileToFeatureId.get(targetPath);
            if (!targetFeatureId || targetFeatureId === sourceFeatureId) continue;

            const key = `${sourceFeatureId}:${targetFeatureId}:depends_on`;
            if (seenRelations.has(key)) continue;
            seenRelations.add(key);

            relationRows.push({
              project_id: state.projectId,
              user_id: userId,
              source_type: "feature",
              source_id: sourceFeatureId,
              target_type: "feature",
              target_id: targetFeatureId,
              relation: "depends_on",
              confidence: 1.0,
              metadata: {
                source_files: [sourcePath],
                target_files: [targetPath],
                scan_job_id: state.scanJobId,
              },
            });
          }
        }

        // Clear stale relations
        await db
          .from("entity_relations" as never)
          .delete()
          .eq("project_id", state.projectId)
          .eq("relation", "depends_on")
          .eq("source_type", "feature")
          .eq("target_type", "feature");

        if (relationRows.length > 0) {
          for (let i = 0; i < relationRows.length; i += 500) {
            const chunk = relationRows.slice(i, i + 500);
            await db.from("entity_relations" as never).insert(chunk as never).then(undefined, () => { /* non-fatal */ });
          }

          await pushLog(state, {
            timestamp: new Date().toISOString(),
            file: "",
            status: "done",
            message: `[REVIEW] Built ${relationRows.length} feature dependency relations`,
          });
        }
      }
    } catch { /* non-fatal */ }

    // 4. LLM quality review (optional, only for scans with enough data)
    const totalNodes = (validationResult?.total_nodes as number) ?? 0;
    const totalEdges = (validationResult?.total_edges as number) ?? 0;

    let llmReview = null;
    if (totalNodes >= 5) {
      try {
        // Fetch sample nodes and edges for review
        const { data: sampleNodes } = await db
          .from("code_nodes" as never)
          .select("name, node_type, layer, summary" as never)
          .eq("project_id", state.projectId)
          .limit(25) as { data: Array<{ name: string; node_type: string; layer: string; summary: string }> | null };

        const { data: sampleEdges } = await db
          .from("code_edges" as never)
          .select("source_node_name, target_node_name, edge_type" as never)
          .eq("project_id", state.projectId)
          .limit(25) as { data: Array<{ source_node_name: string; target_node_name: string; edge_type: string }> | null };

        // Fetch layer stats
        const { data: layerData } = await db
          .from("project_layers" as never)
          .select("name, file_patterns" as never)
          .eq("project_id", state.projectId) as { data: Array<{ name: string; file_patterns: string[] }> | null };

        const layerStats = (layerData ?? []).map((l) => ({
          name: l.name,
          file_count: l.file_patterns?.length ?? 0,
        }));

        llmReview = await reviewGraph(
          state.repoName.split("/").pop() ?? state.repoName,
          {
            total_nodes: totalNodes,
            total_edges: totalEdges,
            total_layers: layerStats.length,
            node_types: (validationResult?.node_types as Record<string, number>) ?? {},
            edge_types: (validationResult?.edge_types as Record<string, number>) ?? {},
            layer_stats: layerStats,
            orphan_count: (validationResult?.orphan_count as number) ?? 0,
            dangling_edges: (validationResult?.dangling_edges as number) ?? 0,
          },
          (sampleNodes ?? []).map((n) => ({
            name: n.name,
            type: n.node_type,
            layer: n.layer,
            summary: n.summary,
          })),
          (sampleEdges ?? []).map((e) => ({
            source: e.source_node_name,
            target: e.target_node_name,
            type: e.edge_type,
          })),
        );

        if (llmReview) {
          const criticalIssues = llmReview.issues.filter((i) => i.severity === "critical");
          await pushLog(state, {
            timestamp: new Date().toISOString(),
            file: "",
            status: llmReview.approved ? "done" : "error",
            message: `[REVIEW] Quality: ${llmReview.quality_score}/100 — ${llmReview.approved ? "APPROVED" : `ISSUES: ${criticalIssues.length} critical`}`,
          });

          if (llmReview.suggestions.length > 0) {
            await pushLog(state, {
              timestamp: new Date().toISOString(),
              file: "",
              status: "done",
              message: `[REVIEW] Suggestions: ${llmReview.suggestions.slice(0, 3).join("; ")}`,
            });
          }
        }
      } catch { /* non-fatal: LLM review is optional */ }
    }

    recordPhase(state, {
      phase: "review",
      status: llmReview?.approved === false ? "partial" : "success",
      duration_ms: Date.now() - phaseStart,
      message: `Resolved ${resolvedCount} edges. Quality: ${llmReview?.quality_score ?? "N/A"}/100`,
      stats: {
        resolved_edges: resolvedCount,
        total_nodes: totalNodes,
        total_edges: totalEdges,
        quality_score: llmReview?.quality_score ?? 0,
      },
    });
  } catch (err) {
    recordPhase(state, {
      phase: "review",
      status: "failed",
      duration_ms: Date.now() - phaseStart,
      message: err instanceof Error ? err.message : "Review phase failed",
    });
    // Non-fatal: review is supplementary
  }
}
