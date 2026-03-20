/**
 * Core scan pipeline. Lives outside "use server" so it can run inside an
 * API route handler that has a proper maxDuration budget (800s on Vercel Pro).
 *
 * Single-invocation: all files are processed in one call. Priority sorting
 * ensures the most important files (src/, app/, lib/) are scanned first.
 * A hard cap of MAX_FILES prevents runaway scans on very large repos.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { getInternalApiUrl, getInternalFetchHeaders } from "@/lib/utils";
import type { Json } from "@/lib/supabase/types";
import {
  getRepoFiles,
  getFileContent,
  getLatestCommitSha,
  getRembIgnorePatterns,
  parseIgnorePatterns,
} from "@/lib/github-reader";
import { extractFeaturesFromFile, generateEmbedding } from "@/lib/openai";
import type { ImportContext } from "@/lib/openai";
import { extractImports, getInternalImports } from "@/lib/import-parser";
import type { ScanLogEntry, ScanResult } from "@/lib/scan-actions";

/** Maximum files to process in a single scan. Priority-sorted so the most important files come first. */
const MAX_FILES = 300;

/** Retry an async operation up to `maxAttempts` times with exponential back-off. */
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

export async function runScan(
  scanJobId: string,
  projectId: string,
  repoName: string,
  branch: string,
  githubToken: string,
): Promise<ScanResult> {
  const db = createAdminClient();

  // ── Mutable state – initialised below from fresh data or restored from DB ──
  let resolvedBranch = branch;
  let scanStartMs = Date.now();
  let commitSha: string | undefined;
  let logs: ScanLogEntry[] = [];
  let queuedFiles: Array<{ path: string; sha: string }> = [];
  let filesTotal = 0;
  let filesProcessed = 0;
  let featuresCreated = 0;
  let entriesCreated = 0;
  let errors = 0;
  const languages: Record<string, number> = {};
  const techStackSet = new Set<string>();
  const featureIdSet = new Set<string>();
  /** All file paths in the repo — used by import parser to resolve relative paths */
  let fileIndex = new Set<string>();

  // ── Persist intermediate state so the UI can poll progress ──────────────────
  function buildJobResult(partial: Partial<ScanResult>): Record<string, unknown> {
    return {
      ...partial,
      logs,
      tech_stack: [...techStackSet],
      languages,
    };
  }

  function trackFile(filePath: string) {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const langMap: Record<string, string> = {
      ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
      py: "Python", go: "Go", rs: "Rust", rb: "Ruby", java: "Java",
      kt: "Kotlin", swift: "Swift", vue: "Vue", svelte: "Svelte",
      astro: "Astro", css: "CSS", scss: "SCSS", sql: "SQL",
      graphql: "GraphQL", prisma: "Prisma", yaml: "YAML", yml: "YAML",
      toml: "TOML",
    };
    const lang = langMap[ext];
    if (lang) languages[lang] = (languages[lang] ?? 0) + 1;

    if (filePath.includes("next.config")) techStackSet.add("Next.js");
    if (filePath.includes("tailwind")) techStackSet.add("Tailwind CSS");
    if (filePath.includes("prisma")) techStackSet.add("Prisma");
    if (filePath.includes("docker") || filePath.includes("Dockerfile")) techStackSet.add("Docker");
    if (filePath.includes("supabase")) techStackSet.add("Supabase");
    if (filePath.endsWith("package.json")) techStackSet.add("Node.js");
    if (filePath.endsWith("go.mod")) techStackSet.add("Go");
    if (filePath.endsWith("Cargo.toml")) techStackSet.add("Rust");
    if (filePath.endsWith("requirements.txt") || filePath.endsWith("pyproject.toml")) techStackSet.add("Python");
  }

  /** Check if the scan was cancelled by the user. Returns true if cancelled. */
  async function isCancelled(): Promise<boolean> {
    try {
      const { data: jobCheck } = await db
        .from("scan_jobs")
        .select("status")
        .eq("id", scanJobId)
        .single();
      return jobCheck?.status === "failed";
    } catch {
      return false;
    }
  }

  /** Rolling log count — we keep all logs for the final result but only send
   *  the latest window in intermediate DB updates to avoid bloating JSONB writes. */
  let dbFlushCounter = 0;

  async function pushLog(entry: ScanLogEntry, partialResult: Partial<ScanResult>) {
    logs.push(entry);
    dbFlushCounter++;
    // Flush every entry during scanning (errors immediately, progress every entry)
    // Use only last 200 logs in intermediate updates to limit JSONB size
    const recentLogs = logs.length > 200 ? logs.slice(-200) : logs;
    const resultWithRecentLogs = { ...buildJobResult(partialResult), logs: recentLogs };
    await db
      .from("scan_jobs")
      .update({ result: resultWithRecentLogs as Json })
      .eq("id", scanJobId);
  }

  try {
    // ── Fail-fast: validate required env vars before any work ──────────────
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY is not set. Cannot extract features without an OpenAI API key. " +
        "Add it to your Vercel environment variables."
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SETUP — fetch file tree, build smart-scan filter, prepare file queue
    // ══════════════════════════════════════════════════════════════════════════
    scanStartMs = Date.now();

    // 0. Fetch current commit SHA (non-fatal)
    try {
      commitSha = await getLatestCommitSha(githubToken, repoName, branch);
    } catch { /* non-fatal */ }

    // 0a. Load per-project ignore patterns from DB
    const { data: projectRow } = await db
      .from("projects")
      .select("ignore_patterns")
      .eq("id", projectId)
      .single();

    const dbIgnorePatterns = projectRow?.ignore_patterns
      ? parseIgnorePatterns(projectRow.ignore_patterns)
      : [];

    // 0b. Fetch .rembignore from the repo root (non-fatal)
    let rembIgnorePatterns: string[] = [];
    try {
      rembIgnorePatterns = await getRembIgnorePatterns(githubToken, repoName, branch);
    } catch { /* non-fatal */ }

    const allIgnorePatterns = [...dbIgnorePatterns, ...rembIgnorePatterns];

    if (allIgnorePatterns.length > 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        file: "",
        status: "done",
        message: `Applying ${allIgnorePatterns.length} ignore pattern(s): ${allIgnorePatterns.slice(0, 5).join(", ")}${allIgnorePatterns.length > 5 ? "…" : ""}`,
      });
    }

    // 0c. Gather already-scanned file SHAs for smart-scan deduplication
    // context_entries doesn't have project_id — join through features
    const { data: projectFeatures } = await db
      .from("features")
      .select("id")
      .eq("project_id", projectId);

    const projectFeatureIds = (projectFeatures ?? []).map((f) => f.id);

    const prevShaMap = new Map<string, string>(); // file_sha → entry id
    const prevFilePathMap = new Map<string, string>(); // file_path → entry id
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
    logs.push({
      timestamp: new Date().toISOString(),
      file: "",
      status: "scanning",
      message: `Fetching file tree for ${repoName}@${branch}...`,
    });

    const { files, truncated, branch: fetchedBranch } = await getRepoFiles(
      githubToken,
      repoName,
      branch,
      allIgnorePatterns
    );

    // Persist the resolved branch so future scans don't need to retry
    if (fetchedBranch !== branch) {
      await db.from("projects").update({ branch: fetchedBranch }).eq("id", projectId);
      resolvedBranch = fetchedBranch;
    }

    filesTotal = files.length;
    for (const f of files) trackFile(f.path);

    const treeNote = truncated
      ? " (tree truncated by GitHub — repo exceeds 100,000 items)"
      : "";
    logs.push({
      timestamp: new Date().toISOString(),
      file: "",
      status: truncated ? "skipped" : "done",
      message: `Found ${files.length} scannable files${allIgnorePatterns.length > 0 ? " (after ignore patterns)" : ""}${treeNote}`,
    });

    // No hard file cap — scan all relevant files (smart-scan skips unchanged ones)
    const filesToScan = files.filter((f) => !prevShaSet.has(f.sha));
    const skippedCount = files.length - filesToScan.length;

    if (skippedCount > 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        file: "",
        status: "done",
        message: `Skipped ${skippedCount} unchanged files (smart scan)`,
      });
    }

    queuedFiles = filesToScan;

    // Build file index for import resolution (ALL repo files, not just queued)
    fileIndex = new Set(files.map((f) => f.path));

    // Remove stale scan entries for files that no longer exist in the repo
    const currentFilePaths = new Set(files.map((f) => f.path));
    const staleEntryIds: string[] = [];
    for (const [filePath, entryId] of prevFilePathMap) {
      if (!currentFilePaths.has(filePath)) {
        staleEntryIds.push(entryId);
      }
    }
    if (staleEntryIds.length > 0) {
      await db.from("context_entries").delete().in("id", staleEntryIds);
      logs.push({
        timestamp: new Date().toISOString(),
        file: "",
        status: "done",
        message: `Removed ${staleEntryIds.length} stale entries for deleted files`,
      });
    }

    // Clear stale file dependencies for this project before rebuilding
    await db.from("file_dependencies").delete().eq("project_id", projectId);

    // ── Priority sort + cap ──────────────────────────────────────────────────
    // Process the most important files first (source code > config > tests).
    // Cap at MAX_FILES to stay within the serverless timeout budget.
    const priorityPrefixes = ["src/", "app/", "lib/", "pages/", "components/", "server/"];
    queuedFiles.sort((a, b) => {
      const aP = priorityPrefixes.some((p) => a.path.startsWith(p)) ? 0 : 1;
      const bP = priorityPrefixes.some((p) => b.path.startsWith(p)) ? 0 : 1;
      return aP - bP;
    });

    if (queuedFiles.length > MAX_FILES) {
      const skippedByCapCount = queuedFiles.length - MAX_FILES;
      queuedFiles = queuedFiles.slice(0, MAX_FILES);
      logs.push({
        timestamp: new Date().toISOString(),
        file: "",
        status: "skipped",
        message: `Capped scan at ${MAX_FILES} files (skipped ${skippedByCapCount} lower-priority files)`,
      });
    }

    // Persist initial state to DB so the UI can show progress immediately
    await db
      .from("scan_jobs")
      .update({
        result: buildJobResult({
          files_total: filesTotal,
          files_scanned: 0,
          features_created: 0,
          entries_created: 0,
          errors: 0,
          duration_ms: 0,
        }) as Json,
      })
      .eq("id", scanJobId);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASS 1: Fetch file contents + build dependency graph (no AI cost)
    // ═══════════════════════════════════════════════════════════════════════════

    await pushLog(
      { timestamp: new Date().toISOString(), file: "", status: "scanning", message: `Indexing imports for ${queuedFiles.length} files...` },
      { files_total: filesTotal, files_scanned: 0, features_created: 0, entries_created: 0, errors: 0, duration_ms: Date.now() - scanStartMs },
    );

    // Import graph: source → [targets]
    const importGraph = new Map<string, string[]>();
    // Reverse graph for fan-in counting: target → [sources]
    const reverseGraph = new Map<string, string[]>();
    // Per-file import details for passing to AI
    const fileImports = new Map<string, Array<{ path: string; symbols: string[] }>>();
    // Track which files had valid content (not oversized or failed)
    const validFiles = new Set<string>();

    // Fetch contents in batches of 5, extract imports, then DISCARD content to save memory.
    // Check for cancellation every 10 files and log progress every 20 files.
    let pass1Processed = 0;
    const pass1Total = queuedFiles.length;

    for (let i = 0; i < queuedFiles.length; i += 5) {
      // ── Cancellation check every batch ──
      if (i > 0 && i % 10 === 0) {
        if (await isCancelled()) throw new Error("Scan cancelled by user");
      }

      const batch = queuedFiles.slice(i, i + 5);
      await Promise.all(batch.map(async (file) => {
        try {
          const content = await getFileContent(githubToken, repoName, file.path);
          if (content.length > 100_000) return; // Skip oversized files
          validFiles.add(file.path);

          // Extract imports (fast regex, no LLM)
          const allImports = extractImports(content, file.path, fileIndex);
          const internalImports = getInternalImports(allImports);

          const targets: string[] = [];
          const imports: Array<{ path: string; symbols: string[] }> = [];

          for (const imp of internalImports) {
            if (imp.resolvedPath) {
              targets.push(imp.resolvedPath);
              imports.push({ path: imp.resolvedPath, symbols: imp.symbols });
              // Build reverse graph
              const rev = reverseGraph.get(imp.resolvedPath) ?? [];
              rev.push(file.path);
              reverseGraph.set(imp.resolvedPath, rev);
            }
          }

          importGraph.set(file.path, targets);
          fileImports.set(file.path, imports);

          // Upsert file dependencies to DB
          if (internalImports.length > 0) {
            const rows = internalImports
              .filter((imp) => imp.resolvedPath)
              .map((imp) => ({
                project_id: projectId,
                source_path: file.path,
                target_path: imp.resolvedPath!,
                import_type: imp.importType,
                imported_symbols: imp.symbols.length > 0 ? imp.symbols : null,
                scan_job_id: scanJobId,
              }));

            if (rows.length > 0) {
              await db.from("file_dependencies").upsert(rows, {
                onConflict: "project_id,source_path,target_path",
              });
            }
          }
        } catch {
          // Non-fatal: content fetch or import extraction failure
        }
      }));

      pass1Processed = Math.min(i + 5, pass1Total);

      // Log progress every 20 files so the UI shows movement
      if (pass1Processed % 20 === 0 || pass1Processed === pass1Total) {
        await pushLog(
          { timestamp: new Date().toISOString(), file: "", status: "scanning", message: `Indexed imports: ${pass1Processed}/${pass1Total} files` },
          { files_total: filesTotal, files_scanned: 0, features_created: 0, entries_created: 0, errors: 0, duration_ms: Date.now() - scanStartMs },
        );
      }
    }

    // ── Topological sort (leaves first → pages/routes last) ──────────────────
    // Kahn's algorithm with cycle handling
    const sortedFiles = topologicalSort(
      queuedFiles.map((f) => f.path),
      importGraph,
    );

    // Map path back to file object (path + sha)
    const fileByPath = new Map(queuedFiles.map((f) => [f.path, f]));

    await pushLog(
      { timestamp: new Date().toISOString(), file: "", status: "done", message: `Dependency graph built: ${validFiles.size} files indexed, ${importGraph.size} with imports` },
      { files_total: filesTotal, files_scanned: 0, features_created: 0, entries_created: 0, errors: 0, duration_ms: Date.now() - scanStartMs },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // PASS 2: AI feature extraction in dependency order (relational context)
    // ═══════════════════════════════════════════════════════════════════════════

    // Running map of already-extracted summaries keyed by file path
    const summaryMap = new Map<string, string>();

    // Process files sequentially in dependency order
    for (const filePath of sortedFiles) {
      const file = fileByPath.get(filePath);
      if (!file) continue;

      if (!validFiles.has(filePath)) {
        // File was skipped in Pass 1 (oversized or fetch failed)
        filesProcessed++;
        continue;
      }

      // Re-fetch content on demand to avoid holding all files in memory
      let content: string;
      try {
        content = await getFileContent(githubToken, repoName, filePath);
      } catch {
        filesProcessed++;
        continue;
      }

      // Check if the scan was cancelled
      if (await isCancelled()) {
        throw new Error("Scan cancelled by user");
      }

      const fileStart = Date.now();
      try {
        await pushLog(
          { timestamp: new Date().toISOString(), file: filePath, status: "scanning", message: `Analyzing ${filePath}` },
          { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
        );

        // Build import context from already-processed dependencies
        const imports = fileImports.get(filePath) ?? [];
        const importCtx: ImportContext[] = [];
        for (const imp of imports) {
          const summary = summaryMap.get(imp.path);
          if (summary) {
            importCtx.push({ path: imp.path, summary, symbols: imp.symbols });
          }
        }

        // Fan-in: how many files import this one → importance signal for AI
        const fanIn = reverseGraph.get(filePath)?.length ?? 0;

        const extracted = await withRetry(() =>
          extractFeaturesFromFile(content, filePath, importCtx.length > 0 ? importCtx : undefined)
        );

        if (!extracted) {
          filesProcessed++;
          await pushLog(
            { timestamp: new Date().toISOString(), file: filePath, status: "skipped", elapsed_ms: Date.now() - fileStart, message: "No features extracted" },
            { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
          );
          continue;
        }

        // Store summary so downstream files (pages, routes) can reference it
        summaryMap.set(filePath, extracted.summary);

        // Boost importance for heavily-imported files
        let adjustedImportance = extracted.importance;
        if (fanIn >= 10) adjustedImportance = Math.min(10, adjustedImportance + 2);
        else if (fanIn >= 5) adjustedImportance = Math.min(10, adjustedImportance + 1);

        // Enrich tech stack from dependency names
        for (const dep of extracted.dependencies) {
          const d = dep.toLowerCase();
          if (d.includes("react")) techStackSet.add("React");
          if (d.includes("next")) techStackSet.add("Next.js");
          if (d.includes("tailwind")) techStackSet.add("Tailwind CSS");
          if (d.includes("prisma")) techStackSet.add("Prisma");
          if (d.includes("supabase")) techStackSet.add("Supabase");
          if (d.includes("stripe")) techStackSet.add("Stripe");
          if (d.includes("openai")) techStackSet.add("OpenAI");
          if (d.includes("redis")) techStackSet.add("Redis");
          if (d.includes("postgres")) techStackSet.add("PostgreSQL");
          if (d.includes("mongodb") || d.includes("mongoose")) techStackSet.add("MongoDB");
          if (d.includes("express")) techStackSet.add("Express");
          if (d.includes("fastify")) techStackSet.add("Fastify");
          if (d.includes("zod")) techStackSet.add("Zod");
          if (d.includes("framer-motion") || d.includes("framer")) techStackSet.add("Framer Motion");
        }

        // Upsert feature
        const { data: existingFeature } = await db
          .from("features")
          .select("id")
          .eq("project_id", projectId)
          .ilike("name", extracted.feature_name)
          .limit(1)
          .single();

        let featureId: string;
        if (existingFeature) {
          featureId = existingFeature.id;
        } else {
          const { data: newFeature, error: featureError } = await db
            .from("features")
            .insert({
              project_id: projectId,
              name: extracted.feature_name,
              description: extracted.summary,
              status: "active",
            })
            .select("id")
            .single();

          if (featureError || !newFeature) {
            errors++;
            continue;
          }
          featureId = newFeature.id;
          featuresCreated++;
        }

        featureIdSet.add(featureId);

        const contextContent = JSON.stringify({
          summary: extracted.summary,
          category: extracted.category,
          importance: adjustedImportance,
          key_decisions: extracted.key_decisions,
          dependencies: extracted.dependencies,
          gotchas: extracted.gotchas,
          tags: extracted.tags,
        });

        // Embedding is optional — semantic search won't work without it but
        // the entry (and its metadata) are still valuable.
        let embedding: number[] | null = null;
        try {
          embedding = await withRetry(() => generateEmbedding(extracted.summary));
        } catch {
          // non-fatal: entry will be created without a vector
        }

        // Semantic dedup: if an existing entry for this file_path has a very
        // similar embedding (cosine > 0.95), update it instead of creating a duplicate.
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
            if (rows?.[0]?.id) {
              const existingMeta = rows[0].metadata;
              // Only dedup if it's the same file path
              if (existingMeta?.file_path === filePath) {
                dedupedEntryId = rows[0].id;
              }
            }
          } catch {
            // RPC may not exist yet — fall through to normal insert
          }
        }

        const entryMetadata = {
          file_path: filePath,
          file_sha: file.sha,
          scan_job_id: scanJobId,
          feature_name: extracted.feature_name,
          category: extracted.category,
          importance: adjustedImportance,
          tags: extracted.tags,
          dependencies: extracted.dependencies,
          fan_in: fanIn,
          imports: imports.map((i) => i.path).slice(0, 20),
        };

        if (dedupedEntryId) {
          // Update existing entry with new content + SHA — no duplicate created
          await db.from("context_entries").update({
            content: contextContent,
            metadata: entryMetadata,
            ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
          }).eq("id", dedupedEntryId);
          entriesCreated++;
        } else {
          const { error: entryError } = await db.from("context_entries").insert({
            feature_id: featureId,
            content: contextContent,
            entry_type: "scan",
            source: "worker",
            metadata: entryMetadata,
            ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
          });

          if (entryError) {
            errors++;
          } else {
            entriesCreated++;
          }
        }

        filesProcessed++;
        await pushLog(
          { timestamp: new Date().toISOString(), file: filePath, status: "done", feature: extracted.feature_name, elapsed_ms: Date.now() - fileStart, message: `Extracted: ${extracted.feature_name}${fanIn > 0 ? ` (imported by ${fanIn} files)` : ""}` },
          { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
        );
      } catch (e) {
        errors++;
        filesProcessed++;
        await pushLog(
          { timestamp: new Date().toISOString(), file: filePath, status: "error", elapsed_ms: Date.now() - fileStart, message: e instanceof Error ? e.message : "Unknown error" },
          { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FINALIZE — mark scan as done
    // ═══════════════════════════════════════════════════════════════════════════
    const duration_ms = Date.now() - scanStartMs;
    const result: ScanResult = {
      files_total: filesTotal,
      files_scanned: filesProcessed,
      features_created: featuresCreated,
      entries_created: entriesCreated,
      errors,
      duration_ms,
      logs,
      tech_stack: [...techStackSet],
      languages,
      commit_sha: commitSha,
      feature_ids: [...featureIdSet],
    };

    await db
      .from("scan_jobs")
      .update({ status: "done", result, finished_at: new Date().toISOString() })
      .eq("id", scanJobId);

    await db.from("projects").update({ status: "active" }).eq("id", projectId);

    // Trigger queue processing — start next queued scan if any
    triggerQueueProcessing();

    return result;
  } catch (err) {
    const duration_ms = Date.now() - scanStartMs;
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Always append an error entry so build log shows what went wrong
    logs.push({
      timestamp: new Date().toISOString(),
      file: "",
      status: "error" as const,
      message: `Scan failed: ${errorMsg}`,
    });

    await db
      .from("scan_jobs")
      .update({
        status: "failed",
        result: {
          error: errorMsg,
          files_total: filesTotal,
          files_scanned: filesProcessed,
          features_created: featuresCreated,
          entries_created: entriesCreated,
          errors: errors + 1,
          duration_ms,
          logs,
          tech_stack: [...techStackSet],
          languages,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("id", scanJobId);

    await db.from("projects").update({ status: "active" }).eq("id", projectId);

    // Trigger queue processing even on failure — free up the slot
    triggerQueueProcessing();

    throw err;
  }
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns files in dependency order (leaves/utilities first → pages/routes last).
 * Files in cycles are appended at the end (processed without full import context).
 */
function topologicalSort(
  filePaths: string[],
  importGraph: Map<string, string[]>,
): string[] {
  const pathSet = new Set(filePaths);
  // In-degree: how many dependencies does this file have (within the scan set)
  const inDegree = new Map<string, number>();
  // Reverse adjacency: target → [sources that depend on it]
  const dependents = new Map<string, string[]>();

  for (const path of filePaths) {
    inDegree.set(path, 0);
  }

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

  // Start with leaf nodes (files that depend on nothing in the scan set)
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

  // Any remaining files are in cycles — append them at the end
  for (const path of filePaths) {
    if (!sorted.includes(path)) sorted.push(path);
  }

  return sorted;
}

function triggerQueueProcessing() {
  const appUrl = getInternalApiUrl();
  const secret = process.env.SCAN_WORKER_SECRET?.trim();
  if (!secret) return;

  fetch(`${appUrl}/api/scan/process-queue`, {
    method: "POST",
    headers: getInternalFetchHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    }),
  }).catch((err) => {
    console.error("[scan-runner] Failed to trigger queue processing:", err);
  });
}
