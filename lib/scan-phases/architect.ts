/**
 * Phase 3: ARCHITECT
 *
 * LLM-powered architecture analysis: semantic layer assignment,
 * cross-cutting concern detection, dependency graph analysis.
 * Falls back to heuristic layer detection if LLM fails.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { analyzeArchitecture } from "@/lib/openai";
import { detectProjectLayers } from "@/lib/layer-detector";
import type { ScanState } from "@/lib/scan-coordinator";
import { pushLog, recordPhase } from "@/lib/scan-coordinator";

export async function runArchitectPhase(state: ScanState): Promise<void> {
  const phaseStart = Date.now();
  const db = createAdminClient();

  try {
    const allPaths = Array.from(state.fileToFeatureId.keys());
    if (allPaths.length === 0) {
      recordPhase(state, {
        phase: "architect",
        status: "skipped",
        duration_ms: Date.now() - phaseStart,
        message: "No files to analyze",
      });
      return;
    }

    await pushLog(state, {
      timestamp: new Date().toISOString(),
      file: "",
      status: "scanning",
      message: `[ARCHITECT] Analyzing architecture for ${allPaths.length} files...`,
    });

    // Build file summaries for LLM
    const fileSummaries = allPaths.map((path) => {
      const summary = state.summaryMap.get(path) ?? "";
      return {
        path,
        summary,
        category: "core" as string,
        importance: 5,
        tags: [] as string[],
      };
    });

    // Attempt LLM architecture analysis
    let usedLLM = false;
    try {
      const analysis = await analyzeArchitecture(
        state.repoName.split("/").pop() ?? state.repoName,
        fileSummaries,
        [...state.techStack],
      );

      if (analysis && analysis.layers.length > 0) {
        usedLLM = true;

        // Clear previous layers
        await db.from("project_layers" as never).delete().eq("project_id", state.projectId);

        // Insert LLM-detected layers
        const layerRows = analysis.layers.map((l) => ({
          project_id: state.projectId,
          name: l.name,
          slug: l.slug,
          description: l.description,
          detection_method: "llm",
          file_patterns: l.file_paths,
          metadata: {
            confidence: l.confidence,
            architecture_style: analysis.architecture_style,
          },
        }));

        await db.from("project_layers" as never).insert(layerRows as never);

        // Update code_nodes with LLM-assigned layers
        for (const layer of analysis.layers) {
          if (layer.file_paths.length > 0) {
            await db
              .from("code_nodes" as never)
              .update({ layer: layer.slug } as never)
              .eq("project_id", state.projectId)
              .in("file_path", layer.file_paths);
          }
        }

        // Store cross-cutting concerns as metadata on the project
        if (analysis.cross_cutting.length > 0 || analysis.dependency_graph.length > 0) {
          // Store in scan result for access
          await pushLog(state, {
            timestamp: new Date().toISOString(),
            file: "",
            status: "done",
            message: `[ARCHITECT] Cross-cutting: ${analysis.cross_cutting.map((c) => c.name).join(", ") || "none"}`,
          });
        }

        await pushLog(state, {
          timestamp: new Date().toISOString(),
          file: "",
          status: "done",
          message: `[ARCHITECT] LLM detected ${analysis.layers.length} layers (${analysis.architecture_style}): ${analysis.layers.map((l) => l.slug).join(", ")}`,
        });

        recordPhase(state, {
          phase: "architect",
          status: "success",
          duration_ms: Date.now() - phaseStart,
          message: `LLM: ${analysis.layers.length} layers, ${analysis.cross_cutting.length} cross-cutting concerns`,
          stats: {
            layers: analysis.layers.length,
            cross_cutting: analysis.cross_cutting.length,
            dep_edges: analysis.dependency_graph.length,
          },
        });
        return;
      }
    } catch {
      // LLM failed — fall through to heuristic
    }

    // Fallback: heuristic layer detection
    if (!usedLLM) {
      const layers = detectProjectLayers(allPaths);
      if (layers.length > 0) {
        await db.from("project_layers" as never).delete().eq("project_id", state.projectId);

        const layerRows = layers.map((l) => ({
          project_id: state.projectId,
          name: l.name,
          slug: l.slug,
          description: `Auto-detected ${l.name.toLowerCase()} (${l.file_patterns.length} files)`,
          detection_method: "heuristic",
          file_patterns: l.file_patterns,
        }));

        await db.from("project_layers" as never).insert(layerRows as never);

        await pushLog(state, {
          timestamp: new Date().toISOString(),
          file: "",
          status: "done",
          message: `[ARCHITECT] Heuristic: ${layers.length} layers: ${layers.map((l) => l.slug).join(", ")}`,
        });
      }

      recordPhase(state, {
        phase: "architect",
        status: usedLLM ? "success" : "partial",
        duration_ms: Date.now() - phaseStart,
        message: `Heuristic fallback: ${layers.length} layers`,
        stats: { layers: layers.length },
      });
    }
  } catch (err) {
    // Non-fatal: architecture analysis is supplementary
    recordPhase(state, {
      phase: "architect",
      status: "failed",
      duration_ms: Date.now() - phaseStart,
      message: err instanceof Error ? err.message : "Architect phase failed",
    });
  }
}
