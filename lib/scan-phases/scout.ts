/**
 * Phase 1: SCOUT
 *
 * Fetches file tree, applies ignore patterns, smart-scan dedup,
 * downloads files (tarball), extracts imports, builds dependency graph.
 * Pure I/O + CPU — no AI cost.
 */

import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  getRepoFiles,
  getFileContent,
  downloadRepoContents,
  getLatestCommitSha,
  getRembIgnorePatterns,
  parseIgnorePatterns,
} from "@/lib/github-reader";
import { extractImports, getInternalImports } from "@/lib/import-parser";
import { preDefineFeatures } from "@/lib/openai";
import type { ScanState, PhaseResult } from "@/lib/scan-coordinator";
import { pushLog, isCancelled, trackFile, recordPhase } from "@/lib/scan-coordinator";

/** Maximum files per scan batch. */
const MAX_FILES = 100;

export async function runScoutPhase(state: ScanState): Promise<void> {
  const phaseStart = Date.now();
  const db = createAdminClient();

  try {
    // 0. Fetch current commit SHA
    try {
      state.commitSha = await getLatestCommitSha(state.githubToken, state.repoName, state.branch);
    } catch { /* non-fatal */ }

    // 0a. Load per-project ignore patterns
    const { data: projectRow } = await db
      .from("projects")
      .select("ignore_patterns")
      .eq("id", state.projectId)
      .single();

    const dbIgnorePatterns = projectRow?.ignore_patterns
      ? parseIgnorePatterns(projectRow.ignore_patterns)
      : [];

    // 0b. Fetch .rembignore from repo root
    let rembIgnorePatterns: string[] = [];
    try {
      rembIgnorePatterns = await getRembIgnorePatterns(state.githubToken, state.repoName, state.branch);
    } catch { /* non-fatal */ }

    const allIgnorePatterns = [...dbIgnorePatterns, ...rembIgnorePatterns];
    if (allIgnorePatterns.length > 0) {
      await pushLog(state, {
        timestamp: new Date().toISOString(),
        file: "",
        status: "done",
        message: `Applying ${allIgnorePatterns.length} ignore pattern(s)`,
      });
    }

    // 0c. Gather already-scanned file SHAs for smart-scan dedup
    const { data: projectFeatures } = await db
      .from("features")
      .select("id")
      .eq("project_id", state.projectId);

    const projectFeatureIds = (projectFeatures ?? []).map((f) => f.id);

    const prevShaMap = new Map<string, string>();
    const prevFilePathMap = new Map<string, string>();
    if (projectFeatureIds.length > 0) {
      const { data: prevEntries } = await db
        .from("context_entries")
        .select("id, metadata")
        .in("feature_id", projectFeatureIds)
        .eq("entry_type", "scan")
        .eq("source", "worker");

      for (const e of prevEntries ?? []) {
        const meta = e.metadata as Record<string, unknown> | null;
        if (meta?.file_sha && typeof meta.file_sha === "string") {
          prevShaMap.set(meta.file_sha, e.id);
        }
        if (meta?.file_path && typeof meta.file_path === "string") {
          prevFilePathMap.set(meta.file_path, e.id);
        }
      }
    }

    const prevShaSet = new Set(prevShaMap.keys());

    // 1. Fetch repo file tree
    await pushLog(state, {
      timestamp: new Date().toISOString(),
      file: "",
      status: "scanning",
      message: `[SCOUT] Fetching file tree for ${state.repoName}@${state.branch}...`,
    });

    const { files, truncated, branch: fetchedBranch } = await getRepoFiles(
      state.githubToken,
      state.repoName,
      state.branch,
      allIgnorePatterns,
    );

    if (fetchedBranch !== state.branch) {
      await db.from("projects").update({ branch: fetchedBranch }).eq("id", state.projectId);
      state.branch = fetchedBranch;
    }

    state.filesTotal = files.length;
    for (const f of files) trackFile(state, f.path);

    await pushLog(state, {
      timestamp: new Date().toISOString(),
      file: "",
      status: truncated ? "skipped" : "done",
      message: `[SCOUT] Found ${files.length} scannable files${truncated ? " (tree truncated)" : ""}`,
    });

    // Smart-scan: filter unchanged files
    const changedFiles = files.filter((f) => !prevShaSet.has(f.sha));
    const skippedCount = files.length - changedFiles.length;

    // Change propagation: re-scan consumers of changed files
    const changedPaths = new Set(changedFiles.map((f) => f.path));
    const propagatedPaths = new Set<string>();

    if (changedFiles.length > 0 && changedFiles.length < files.length) {
      const { data: prevDeps } = await db
        .from("file_dependencies")
        .select("source_path, target_path")
        .eq("project_id", state.projectId);

      if (prevDeps?.length) {
        const prevReverse = new Map<string, string[]>();
        for (const d of prevDeps) {
          const rev = prevReverse.get(d.target_path) ?? [];
          rev.push(d.source_path);
          prevReverse.set(d.target_path, rev);
        }
        for (const changedPath of changedPaths) {
          for (const consumer of prevReverse.get(changedPath) ?? []) {
            if (!changedPaths.has(consumer)) propagatedPaths.add(consumer);
          }
        }
      }
    }

    const propagatedFiles = files.filter((f) => propagatedPaths.has(f.path));
    const filesToScan = [...changedFiles, ...propagatedFiles];

    if (propagatedFiles.length > 0) {
      await pushLog(state, {
        timestamp: new Date().toISOString(),
        file: "",
        status: "done",
        message: `[SCOUT] Change propagation: ${propagatedFiles.length} consumer(s) queued`,
      });
    }

    if (skippedCount > 0) {
      await pushLog(state, {
        timestamp: new Date().toISOString(),
        file: "",
        status: "done",
        message: `[SCOUT] Skipped ${skippedCount} unchanged files (smart scan)`,
      });
    }

    state.queuedFiles = filesToScan;
    state.fileIndex = new Set(files.map((f) => f.path));

    // Remove stale entries for deleted files
    const currentFilePaths = new Set(files.map((f) => f.path));
    const staleEntryIds: string[] = [];
    for (const [filePath, entryId] of prevFilePathMap) {
      if (!currentFilePaths.has(filePath)) staleEntryIds.push(entryId);
    }
    if (staleEntryIds.length > 0) {
      await db.from("context_entries").delete().in("id", staleEntryIds);
    }

    // Clear stale file dependencies
    await db.from("file_dependencies").delete().eq("project_id", state.projectId);

    // Priority sort + cap
    const priorityPrefixes = ["src/", "app/", "lib/", "pages/", "components/", "server/"];
    state.queuedFiles.sort((a, b) => {
      const aP = priorityPrefixes.some((p) => a.path.startsWith(p)) ? 0 : 1;
      const bP = priorityPrefixes.some((p) => b.path.startsWith(p)) ? 0 : 1;
      return aP - bP;
    });

    if (state.queuedFiles.length > MAX_FILES) {
      state.filesRemaining = state.queuedFiles.length - MAX_FILES;
      state.queuedFiles = state.queuedFiles.slice(0, MAX_FILES);
      await pushLog(state, {
        timestamp: new Date().toISOString(),
        file: "",
        status: "skipped",
        message: `[SCOUT] Capped at ${MAX_FILES} files (${state.filesRemaining} remaining — will auto-continue)`,
      });
    }

    // Persist initial state
    await db
      .from("scan_jobs")
      .update({
        result: {
          files_total: state.filesTotal,
          files_scanned: 0,
          features_created: 0,
          entries_created: 0,
          errors: 0,
          duration_ms: 0,
          logs: state.logs.slice(-200),
          tech_stack: [...state.techStack],
          languages: state.languages,
        } as Json,
      })
      .eq("id", state.scanJobId);

    // ── Download files ──
    const allQueuedPaths = new Set(state.queuedFiles.map((f) => f.path));

    await pushLog(state, {
      timestamp: new Date().toISOString(),
      file: "",
      status: "scanning",
      message: `[SCOUT] Downloading ${state.queuedFiles.length} files via tarball...`,
    });

    try {
      const tarContents = await downloadRepoContents(
        state.githubToken, state.repoName, state.branch, allQueuedPaths,
      );
      for (const [path, content] of tarContents) {
        state.contentCache.set(path, content);
      }
      await pushLog(state, {
        timestamp: new Date().toISOString(),
        file: "",
        status: "done",
        message: `[SCOUT] Downloaded ${state.contentCache.size}/${state.queuedFiles.length} files via tarball`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await pushLog(state, {
        timestamp: new Date().toISOString(),
        file: "",
        status: "error",
        message: `[SCOUT] Tarball failed (${msg}), falling back to per-file fetch`,
      });
    }

    // Fetch missing files individually
    const missingPaths = state.queuedFiles.filter((f) => !state.contentCache.has(f.path));
    if (missingPaths.length > 0) {
      for (let i = 0; i < missingPaths.length; i += 5) {
        if (i > 0 && i % 10 === 0 && await isCancelled(state.scanJobId)) {
          throw new Error("Scan cancelled by user");
        }
        const batch = missingPaths.slice(i, i + 5);
        await Promise.all(batch.map(async (file) => {
          try {
            const content = await getFileContent(state.githubToken, state.repoName, file.path);
            if (content.length <= 100_000) state.contentCache.set(file.path, content);
          } catch { /* non-fatal */ }
        }));
      }
    }

    // ── Extract imports + build dependency graph ──
    await pushLog(state, {
      timestamp: new Date().toISOString(),
      file: "",
      status: "scanning",
      message: `[SCOUT] Indexing imports for ${state.contentCache.size} files...`,
    });

    const allDepRows: Array<{
      project_id: string;
      source_path: string;
      target_path: string;
      import_type: string;
      imported_symbols: string[] | null;
      scan_job_id: string;
    }> = [];

    for (const [filePath, content] of state.contentCache) {
      try {
        state.validFiles.add(filePath);
        const allImports = extractImports(content, filePath, state.fileIndex);
        const internalImports = getInternalImports(allImports);

        const targets: string[] = [];
        const imports: Array<{ path: string; symbols: string[] }> = [];

        for (const imp of internalImports) {
          if (imp.resolvedPath) {
            targets.push(imp.resolvedPath);
            imports.push({ path: imp.resolvedPath, symbols: imp.symbols });
            const rev = state.reverseGraph.get(imp.resolvedPath) ?? [];
            rev.push(filePath);
            state.reverseGraph.set(imp.resolvedPath, rev);
          }
        }

        state.importGraph.set(filePath, targets);
        state.fileImports.set(filePath, imports);

        for (const imp of internalImports) {
          if (imp.resolvedPath) {
            allDepRows.push({
              project_id: state.projectId,
              source_path: filePath,
              target_path: imp.resolvedPath,
              import_type: imp.importType,
              imported_symbols: imp.symbols.length > 0 ? imp.symbols : null,
              scan_job_id: state.scanJobId,
            });
          }
        }
      } catch { /* non-fatal */ }
    }

    // Bulk upsert file dependencies
    if (allDepRows.length > 0) {
      for (let i = 0; i < allDepRows.length; i += 500) {
        const chunk = allDepRows.slice(i, i + 500);
        await db.from("file_dependencies").upsert(chunk, {
          onConflict: "project_id,source_path,target_path",
        }).then(undefined, () => { /* non-fatal */ });
      }
    }

    // Topological sort
    state.sortedFiles = topologicalSort(
      state.queuedFiles.map((f) => f.path),
      state.importGraph,
    );

    await pushLog(state, {
      timestamp: new Date().toISOString(),
      file: "",
      status: "done",
      message: `[SCOUT] Dependency graph: ${state.validFiles.size} files indexed, ${state.importGraph.size} with imports`,
    });

    // ── Pre-define feature taxonomy ──
    const readmeKey = [...state.contentCache.keys()].find((k) =>
      /^readme\.md$/i.test(k.split("/").pop() ?? ""),
    );
    const pkgKey = [...state.contentCache.keys()].find((k) =>
      k.endsWith("package.json") && !k.includes("node_modules") && k.split("/").length <= 2,
    );

    try {
      const features = await preDefineFeatures(
        state.repoName,
        Array.from(state.fileIndex),
        readmeKey ? state.contentCache.get(readmeKey) : undefined,
        pkgKey ? state.contentCache.get(pkgKey) : undefined,
      );

      if (features.length > 0) {
        state.preDefinedFeatures = features;

        // Upsert features to DB so Analyze phase can match by ID
        for (const f of features) {
          const { data: existing } = await db
            .from("features")
            .select("id")
            .eq("project_id", state.projectId)
            .ilike("name", f.name)
            .limit(1)
            .single();

          if (!existing) {
            await db.from("features").insert({
              project_id: state.projectId,
              name: f.name,
              description: f.description,
              status: "active",
            });
          }
        }

        await pushLog(state, {
          timestamp: new Date().toISOString(),
          file: "",
          status: "done",
          message: `[SCOUT] Pre-defined ${features.length} features: ${features.map((f) => f.name).join(", ")}`,
        });
      }
    } catch (e) {
      // Non-fatal — Analyze will fall back to per-file extraction names
      await pushLog(state, {
        timestamp: new Date().toISOString(),
        file: "",
        status: "skipped",
        message: `[SCOUT] Feature pre-definition failed: ${e instanceof Error ? e.message : "unknown error"}`,
      });
    }

    recordPhase(state, {
      phase: "scout",
      status: "success",
      duration_ms: Date.now() - phaseStart,
      message: `${state.queuedFiles.length} files queued, ${state.importGraph.size} import edges`,
      stats: {
        files_total: state.filesTotal,
        files_queued: state.queuedFiles.length,
        files_skipped: skippedCount,
        files_propagated: propagatedFiles.length,
        import_edges: allDepRows.length,
      },
    });
  } catch (err) {
    recordPhase(state, {
      phase: "scout",
      status: "failed",
      duration_ms: Date.now() - phaseStart,
      message: err instanceof Error ? err.message : "Scout phase failed",
    });
    throw err;
  }
}

// ─── Helpers (moved from scan-runner.ts) ─────────────────────────────────────

/**
 * Topological sort using Kahn's algorithm.
 * Leaves/utilities first → pages/routes last.
 */
function topologicalSort(
  filePaths: string[],
  importGraph: Map<string, string[]>,
): string[] {
  const pathSet = new Set(filePaths);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const path of filePaths) inDegree.set(path, 0);

  for (const path of filePaths) {
    const deps = importGraph.get(path) ?? [];
    for (const dep of deps) {
      if (pathSet.has(dep)) {
        inDegree.set(path, (inDegree.get(path) ?? 0) + 1);
        const rev = dependents.get(dep) ?? [];
        rev.push(path);
        dependents.set(dep, rev);
      }
    }
  }

  const queue: string[] = [];
  for (const [path, degree] of inDegree) {
    if (degree === 0) queue.push(path);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const dependent of dependents.get(current) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  for (const path of filePaths) {
    if (!sorted.includes(path)) sorted.push(path);
  }

  return sorted;
}

/**
 * Group files into tiers by dependency depth.
 * Files in the same tier can run in parallel.
 */
export function topologicalTiers(
  sortedFiles: string[],
  importGraph: Map<string, string[]>,
): string[][] {
  const pathSet = new Set(sortedFiles);
  const depth = new Map<string, number>();

  for (const path of sortedFiles) {
    let maxDepth = -1;
    for (const dep of importGraph.get(path) ?? []) {
      if (pathSet.has(dep) && depth.has(dep)) {
        maxDepth = Math.max(maxDepth, depth.get(dep)!);
      }
    }
    depth.set(path, maxDepth + 1);
  }

  const tierMap = new Map<number, string[]>();
  for (const path of sortedFiles) {
    const d = depth.get(path) ?? 0;
    const tier = tierMap.get(d) ?? [];
    tier.push(path);
    tierMap.set(d, tier);
  }

  const maxTier = Math.max(...tierMap.keys(), 0);
  const tiers: string[][] = [];
  for (let i = 0; i <= maxTier; i++) {
    const tier = tierMap.get(i);
    if (tier && tier.length > 0) tiers.push(tier);
  }
  return tiers;
}
