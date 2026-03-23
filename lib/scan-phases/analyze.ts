/**
 * Phase 2: ANALYZE
 *
 * Parallel AI extraction: processes files through topological tiers,
 * generates feature entries, code_nodes, and code_edges.
 * This is the most expensive phase (LLM calls + embeddings).
 */

import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  extractFeaturesFromFile,
  extractGranularCodeGraph,
  generateEmbedding,
} from "@/lib/openai";
import type { ImportContext, GranularExtraction } from "@/lib/openai";
import { detectLayer } from "@/lib/layer-detector";
import { detectPatterns } from "@/lib/pattern-detector";
import type { ScanState } from "@/lib/scan-coordinator";
import { pushLog, isCancelled, recordPhase } from "@/lib/scan-coordinator";
import { topologicalTiers } from "@/lib/scan-phases/scout";

/** Parallel AI calls per tier. */
const AI_CONCURRENCY = 5;

/** Retry with exponential backoff. */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

export async function runAnalyzePhase(state: ScanState): Promise<void> {
  const phaseStart = Date.now();
  const db = createAdminClient();

  try {
    const fileByPath = new Map(state.queuedFiles.map((f) => [f.path, f]));

    /** Process a single file through AI extraction + DB upsert */
    async function processFile(filePath: string) {
      const file = fileByPath.get(filePath);
      if (!file || !state.validFiles.has(filePath)) {
        state.filesProcessed++;
        return;
      }

      const content = state.contentCache.get(filePath);
      if (!content) {
        state.filesProcessed++;
        return;
      }

      const fileStart = Date.now();
      try {
        await pushLog(state, {
          timestamp: new Date().toISOString(),
          file: filePath,
          status: "scanning",
          message: `[ANALYZE] ${filePath}`,
        });

        // Build import context from already-processed deps
        const imports = state.fileImports.get(filePath) ?? [];
        const importCtx: ImportContext[] = [];
        for (const imp of imports) {
          const summary = state.summaryMap.get(imp.path);
          if (summary) importCtx.push({ path: imp.path, summary, symbols: imp.symbols });
        }

        const fanIn = state.reverseGraph.get(filePath)?.length ?? 0;

        // Granular extraction with fallback
        let extracted: GranularExtraction | null = null;
        try {
          extracted = await withRetry(() =>
            extractGranularCodeGraph(content, filePath, importCtx.length > 0 ? importCtx : undefined),
          );
        } catch { /* fall through */ }

        if (!extracted) {
          const basic = await withRetry(() =>
            extractFeaturesFromFile(content, filePath, importCtx.length > 0 ? importCtx : undefined),
          );
          if (basic) {
            extracted = {
              ...basic,
              layer: detectLayer(filePath, content),
              symbols: [],
              internal_calls: [],
              data_flows: [],
            };
          }
        }

        if (!extracted) {
          state.filesProcessed++;
          await pushLog(state, {
            timestamp: new Date().toISOString(),
            file: filePath,
            status: "skipped",
            elapsed_ms: Date.now() - fileStart,
            message: "No features extracted",
          });
          return;
        }

        state.summaryMap.set(filePath, extracted.summary);

        // Boost importance for heavily-imported files
        let adjustedImportance = extracted.importance;
        if (fanIn >= 10) adjustedImportance = Math.min(10, adjustedImportance + 2);
        else if (fanIn >= 5) adjustedImportance = Math.min(10, adjustedImportance + 1);

        // Enrich tech stack
        for (const dep of extracted.dependencies) {
          const d = dep.toLowerCase();
          if (d.includes("react")) state.techStack.add("React");
          if (d.includes("next")) state.techStack.add("Next.js");
          if (d.includes("tailwind")) state.techStack.add("Tailwind CSS");
          if (d.includes("prisma")) state.techStack.add("Prisma");
          if (d.includes("supabase")) state.techStack.add("Supabase");
          if (d.includes("stripe")) state.techStack.add("Stripe");
          if (d.includes("openai")) state.techStack.add("OpenAI");
          if (d.includes("redis")) state.techStack.add("Redis");
          if (d.includes("postgres")) state.techStack.add("PostgreSQL");
          if (d.includes("mongodb") || d.includes("mongoose")) state.techStack.add("MongoDB");
          if (d.includes("express")) state.techStack.add("Express");
          if (d.includes("fastify")) state.techStack.add("Fastify");
          if (d.includes("zod")) state.techStack.add("Zod");
          if (d.includes("framer-motion") || d.includes("framer")) state.techStack.add("Framer Motion");
        }

        // ── Match to pre-defined feature taxonomy ──
        let resolvedFeatureName = extracted.feature_name;

        if (state.preDefinedFeatures.length > 0) {
          const lowerName = extracted.feature_name.toLowerCase();
          const dirParts = filePath.toLowerCase().split("/");

          // 1. Exact name match (case-insensitive)
          let matched = state.preDefinedFeatures.find(
            (f) => f.name.toLowerCase() === lowerName,
          );

          // 2. Keyword match — any keyword appears in the LLM feature name
          if (!matched) {
            matched = state.preDefinedFeatures.find((f) =>
              f.keywords.some((kw) => lowerName.includes(kw.toLowerCase())),
            );
          }

          // 3. Directory hint match — file path contains a hint
          if (!matched) {
            matched = state.preDefinedFeatures.find((f) =>
              f.directory_hints.some((hint) =>
                dirParts.some((part) => part.includes(hint.toLowerCase())),
              ),
            );
          }

          // 4. Substring overlap — pre-defined name words appear in extracted name
          if (!matched) {
            matched = state.preDefinedFeatures.find((f) => {
              const words = f.name.toLowerCase().split(/\s+/);
              return words.filter((w) => w.length > 3).some((w) => lowerName.includes(w));
            });
          }

          if (matched) {
            resolvedFeatureName = matched.name;
          }
        }

        // ── Upsert feature ──
        const { data: existingFeature } = await db
          .from("features")
          .select("id")
          .eq("project_id", state.projectId)
          .ilike("name", resolvedFeatureName)
          .limit(1)
          .single();

        let featureId: string;
        if (existingFeature) {
          featureId = existingFeature.id;
        } else {
          const { data: newFeature, error: featureError } = await db
            .from("features")
            .insert({
              project_id: state.projectId,
              name: resolvedFeatureName,
              description: extracted.summary,
              status: "active",
            })
            .select("id")
            .single();

          if (featureError || !newFeature) {
            state.errors++;
            return;
          }
          featureId = newFeature.id;
          state.featuresCreated++;
        }

        state.featureIds.add(featureId);
        state.fileToFeatureId.set(filePath, featureId);

        const contextContent = JSON.stringify({
          summary: extracted.summary,
          category: extracted.category,
          importance: adjustedImportance,
          key_decisions: extracted.key_decisions,
          dependencies: extracted.dependencies,
          gotchas: extracted.gotchas,
          tags: extracted.tags,
        });

        // Generate embedding
        let embedding: number[] | null = null;
        try {
          embedding = await withRetry(() => generateEmbedding(extracted.summary));
        } catch { /* non-fatal */ }

        // Semantic dedup
        let dedupedEntryId: string | null = null;
        if (embedding) {
          try {
            const { data: similar } = await db.rpc("match_context_entries" as "search_context", {
              query_embedding: `[${embedding.join(",")}]`,
              match_threshold: 0.95,
              match_count: 1,
              p_feature_id: featureId,
            } as never);
            const rows = similar as unknown as Array<{ id: string; metadata: Record<string, unknown> | null }> | null;
            if (rows?.[0]) {
              const existingMeta = rows[0].metadata;
              if (existingMeta?.file_path === filePath) {
                dedupedEntryId = rows[0].id;
              }
            }
          } catch { /* RPC may not exist */ }
        }

        const entryMetadata = {
          file_path: filePath,
          file_sha: file.sha,
          scan_job_id: state.scanJobId,
          feature_name: resolvedFeatureName,
          category: extracted.category,
          importance: adjustedImportance,
          tags: extracted.tags,
          dependencies: extracted.dependencies,
          fan_in: fanIn,
          imports: (state.fileImports.get(filePath) ?? []).map((i) => i.path).slice(0, 20),
        };

        if (dedupedEntryId) {
          await db.from("context_entries").update({
            content: contextContent,
            metadata: entryMetadata,
            ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
          }).eq("id", dedupedEntryId);
          state.entriesCreated++;
        } else {
          const { error: entryError } = await db.from("context_entries").insert({
            feature_id: featureId,
            content: contextContent,
            entry_type: "scan",
            source: "worker",
            metadata: entryMetadata,
            ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
          });
          if (entryError) state.errors++;
          else state.entriesCreated++;
        }

        // ── Code Graph: granular nodes + edges ──
        if (extracted.symbols.length > 0) {
          try {
            const heuristicLayer = detectLayer(
              filePath,
              content,
              extracted.layer as "api" | "service" | "data" | "ui" | "middleware" | "utility" | "test" | "config" | "core",
            );

            const patterns = detectPatterns(extracted.summary, extracted.tags, filePath);

            const fileNodeRows: Array<{
              project_id: string;
              file_path: string;
              node_type: string;
              name: string;
              summary: string;
              layer: string;
              tags: string[];
              complexity: string | null;
              structure: Json;
              embedding?: string;
            }> = [{
              project_id: state.projectId,
              file_path: filePath,
              node_type: "file",
              name: filePath.split("/").pop() ?? filePath,
              summary: extracted.summary,
              layer: heuristicLayer,
              tags: patterns.length > 0
                ? [...extracted.tags, ...patterns.map((p) => `pattern:${p.name}`)]
                : extracted.tags,
              complexity: null,
              structure: {
                category: extracted.category,
                importance: extracted.importance,
                fan_in: fanIn,
                key_decisions: extracted.key_decisions,
                gotchas: extracted.gotchas,
                architecture_patterns: patterns.length > 0 ? patterns : undefined,
              } as unknown as Json,
              ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
            }];

            for (const sym of extracted.symbols) {
              let symEmbedding: number[] | null = null;
              try {
                symEmbedding = await generateEmbedding(`${sym.name}: ${sym.summary}`);
              } catch { /* non-fatal */ }

              fileNodeRows.push({
                project_id: state.projectId,
                file_path: filePath,
                node_type: sym.type,
                name: sym.name,
                summary: sym.summary,
                layer: heuristicLayer,
                tags: [],
                complexity: sym.complexity,
                structure: {
                  line_start: sym.line_start,
                  line_end: sym.line_end,
                  params: sym.params,
                  return_type: sym.return_type,
                  methods: sym.methods,
                  properties: sym.properties,
                } as unknown as Json,
                ...(symEmbedding ? { embedding: `[${symEmbedding.join(",")}]` } : {}),
              });
            }

            // Clear previous nodes for this file, then insert
            await db.from("code_nodes" as never).delete().eq("project_id", state.projectId).eq("file_path", filePath);
            for (let i = 0; i < fileNodeRows.length; i += 50) {
              await db.from("code_nodes" as never).insert(fileNodeRows.slice(i, i + 50) as never);
            }

            // Build edges
            const edgeRows: Array<Record<string, unknown>> = [];
            for (const call of extracted.internal_calls) {
              edgeRows.push({
                project_id: state.projectId,
                source_node_name: call.from,
                source_file: filePath,
                target_node_name: call.to,
                target_file: call.target_file ?? filePath,
                edge_type: "calls",
                edge_category: "behavioral",
                weight: 1.0,
              });
            }
            for (const flow of extracted.data_flows) {
              if (flow.reads_from) {
                edgeRows.push({
                  project_id: state.projectId,
                  source_node_name: flow.symbol,
                  source_file: filePath,
                  target_node_name: flow.reads_from,
                  target_file: filePath,
                  edge_type: "reads",
                  edge_category: "data_flow",
                  weight: 0.8,
                });
              }
              if (flow.writes_to) {
                edgeRows.push({
                  project_id: state.projectId,
                  source_node_name: flow.symbol,
                  source_file: filePath,
                  target_node_name: flow.writes_to,
                  target_file: filePath,
                  edge_type: "writes",
                  edge_category: "data_flow",
                  weight: 0.8,
                });
              }
            }

            if (edgeRows.length > 0) {
              await db.from("code_edges" as never).delete().eq("project_id", state.projectId).eq("source_file", filePath);
              for (let i = 0; i < edgeRows.length; i += 100) {
                await db.from("code_edges" as never).insert(edgeRows.slice(i, i + 100) as never);
              }
            }
          } catch { /* non-fatal: code graph is supplementary */ }
        }

        state.filesProcessed++;
        await pushLog(state, {
          timestamp: new Date().toISOString(),
          file: filePath,
          status: "done",
          feature: resolvedFeatureName,
          elapsed_ms: Date.now() - fileStart,
          message: `[ANALYZE] ${resolvedFeatureName}${fanIn > 0 ? ` (fan-in: ${fanIn})` : ""}`,
        });
      } catch (e) {
        state.errors++;
        state.filesProcessed++;
        await pushLog(state, {
          timestamp: new Date().toISOString(),
          file: filePath,
          status: "error",
          elapsed_ms: Date.now() - fileStart,
          message: e instanceof Error ? e.message : "Unknown error",
        });
      } finally {
        state.contentCache.delete(filePath);
      }
    }

    // Process in topological tiers
    const tiers = topologicalTiers(state.sortedFiles, state.importGraph);

    for (const tier of tiers) {
      if (await isCancelled(state.scanJobId)) throw new Error("Scan cancelled by user");

      for (let i = 0; i < tier.length; i += AI_CONCURRENCY) {
        const batch = tier.slice(i, i + AI_CONCURRENCY);
        await Promise.all(batch.map(processFile));
      }
    }

    state.contentCache.clear();

    recordPhase(state, {
      phase: "analyze",
      status: state.errors > 0 ? "partial" : "success",
      duration_ms: Date.now() - phaseStart,
      message: `${state.filesProcessed} files processed, ${state.featuresCreated} features, ${state.entriesCreated} entries`,
      stats: {
        files_processed: state.filesProcessed,
        features_created: state.featuresCreated,
        entries_created: state.entriesCreated,
        errors: state.errors,
      },
    });
  } catch (err) {
    recordPhase(state, {
      phase: "analyze",
      status: "failed",
      duration_ms: Date.now() - phaseStart,
      message: err instanceof Error ? err.message : "Analyze phase failed",
    });
    throw err;
  }
}
