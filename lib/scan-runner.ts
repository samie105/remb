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
  downloadRepoContents,
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
  // Maps file paths to their extracted feature IDs (for entity relation building)
  const fileToFeatureId = new Map<string, string>();
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

  /** Cap in-memory logs to prevent unbounded growth during large scans. */
  const MAX_IN_MEMORY_LOGS = 500;

  async function pushLog(entry: ScanLogEntry, partialResult: Partial<ScanResult>) {
    logs.push(entry);
    // Cap in-memory logs — keep recent entries
    if (logs.length > MAX_IN_MEMORY_LOGS) {
      logs.splice(0, logs.length - MAX_IN_MEMORY_LOGS);
    }
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
    const changedFiles = files.filter((f) => !prevShaSet.has(f.sha));
    const skippedCount = files.length - changedFiles.length;

    // ── Change propagation: also re-scan consumers of changed files ──
    // If file B imports file A and A changed, B's analysis may be stale since
    // it references A's summary. Use the previous scan's dependency graph to
    // identify these consumers.
    const changedPaths = new Set(changedFiles.map((f) => f.path));
    const propagatedPaths = new Set<string>();

    if (changedFiles.length > 0 && changedFiles.length < files.length) {
      // Load existing file dependencies for reverse lookup
      const { data: prevDeps } = await db
        .from("file_dependencies")
        .select("source_path, target_path")
        .eq("project_id", projectId);

      if (prevDeps?.length) {
        // Build reverse graph: target → [sources that import it]
        const prevReverse = new Map<string, string[]>();
        for (const d of prevDeps) {
          const rev = prevReverse.get(d.target_path) ?? [];
          rev.push(d.source_path);
          prevReverse.set(d.target_path, rev);
        }

        // For each changed file, propagate to its direct consumers
        for (const changedPath of changedPaths) {
          const consumers = prevReverse.get(changedPath) ?? [];
          for (const consumer of consumers) {
            if (!changedPaths.has(consumer)) {
              propagatedPaths.add(consumer);
            }
          }
        }
      }
    }

    // Add propagated files to the scan queue (they exist in `files` but were skipped by SHA check)
    const propagatedFiles = files.filter((f) => propagatedPaths.has(f.path));
    const filesToScan = [...changedFiles, ...propagatedFiles];

    if (propagatedFiles.length > 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        file: "",
        status: "done",
        message: `Change propagation: ${propagatedFiles.length} consumer(s) queued for re-analysis`,
      });
    }

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
    // PASS 1: Download all files + build dependency graph (no AI cost)
    // ═══════════════════════════════════════════════════════════════════════════

    // Import graph: source → [targets]
    const importGraph = new Map<string, string[]>();
    // Reverse graph for fan-in counting: target → [sources]
    const reverseGraph = new Map<string, string[]>();
    // Per-file import details for passing to AI
    const fileImports = new Map<string, Array<{ path: string; symbols: string[] }>>();
    // Content cache: holds all file contents from tarball (or per-file fallback)
    const contentCache = new Map<string, string>();

    // ── Step 1a: Bulk-download all file contents via tarball (1 HTTP request) ──
    const allQueuedPaths = new Set(queuedFiles.map((f) => f.path));

    await pushLog(
      { timestamp: new Date().toISOString(), file: "", status: "scanning", message: `Downloading ${queuedFiles.length} files via tarball...` },
      { files_total: filesTotal, files_scanned: 0, features_created: 0, entries_created: 0, errors: 0, duration_ms: Date.now() - scanStartMs },
    );

    let usedTarball = false;
    try {
      const tarContents = await downloadRepoContents(githubToken, repoName, resolvedBranch, allQueuedPaths);
      for (const [path, content] of tarContents) {
        contentCache.set(path, content);
      }
      usedTarball = true;
      await pushLog(
        { timestamp: new Date().toISOString(), file: "", status: "done", message: `Downloaded ${contentCache.size}/${queuedFiles.length} files via tarball` },
        { files_total: filesTotal, files_scanned: 0, features_created: 0, entries_created: 0, errors: 0, duration_ms: Date.now() - scanStartMs },
      );
    } catch (e) {
      // Tarball failed — fall back to per-file fetching
      const msg = e instanceof Error ? e.message : String(e);
      await pushLog(
        { timestamp: new Date().toISOString(), file: "", status: "error", message: `Tarball download failed (${msg}), falling back to per-file fetch` },
        { files_total: filesTotal, files_scanned: 0, features_created: 0, entries_created: 0, errors: 0, duration_ms: Date.now() - scanStartMs },
      );
    }

    // ── Step 1b: Fetch any missing files individually (tarball fallback or missing files) ──
    const missingPaths = queuedFiles.filter((f) => !contentCache.has(f.path));
    if (missingPaths.length > 0) {
      await pushLog(
        { timestamp: new Date().toISOString(), file: "", status: "scanning", message: `Fetching ${missingPaths.length} remaining files individually...` },
        { files_total: filesTotal, files_scanned: 0, features_created: 0, entries_created: 0, errors: 0, duration_ms: Date.now() - scanStartMs },
      );

      for (let i = 0; i < missingPaths.length; i += 5) {
        if (i > 0 && i % 10 === 0) {
          if (await isCancelled()) throw new Error("Scan cancelled by user");
        }
        const batch = missingPaths.slice(i, i + 5);
        await Promise.all(batch.map(async (file) => {
          try {
            const content = await getFileContent(githubToken, repoName, file.path);
            if (content.length <= 100_000) contentCache.set(file.path, content);
          } catch {
            // non-fatal
          }
        }));

        await pushLog(
          { timestamp: new Date().toISOString(), file: "", status: "scanning", message: `Fetched: ${Math.min(i + 5, missingPaths.length)}/${missingPaths.length} remaining files` },
          { files_total: filesTotal, files_scanned: 0, features_created: 0, entries_created: 0, errors: 0, duration_ms: Date.now() - scanStartMs },
        );
      }
    }

    // ── Step 1c: Extract imports from all cached content (pure CPU, very fast) ──
    await pushLog(
      { timestamp: new Date().toISOString(), file: "", status: "scanning", message: `Indexing imports for ${contentCache.size} files...` },
      { files_total: filesTotal, files_scanned: 0, features_created: 0, entries_created: 0, errors: 0, duration_ms: Date.now() - scanStartMs },
    );

    const validFiles = new Set<string>();
    const allDepRows: Array<{
      project_id: string;
      source_path: string;
      target_path: string;
      import_type: string;
      imported_symbols: string[] | null;
      scan_job_id: string;
    }> = [];

    for (const [filePath, content] of contentCache) {
      try {
        validFiles.add(filePath);
        const allImports = extractImports(content, filePath, fileIndex);
        const internalImports = getInternalImports(allImports);

        const targets: string[] = [];
        const imports: Array<{ path: string; symbols: string[] }> = [];

        for (const imp of internalImports) {
          if (imp.resolvedPath) {
            targets.push(imp.resolvedPath);
            imports.push({ path: imp.resolvedPath, symbols: imp.symbols });
            const rev = reverseGraph.get(imp.resolvedPath) ?? [];
            rev.push(filePath);
            reverseGraph.set(imp.resolvedPath, rev);
          }
        }

        importGraph.set(filePath, targets);
        fileImports.set(filePath, imports);

        for (const imp of internalImports) {
          if (imp.resolvedPath) {
            allDepRows.push({
              project_id: projectId,
              source_path: filePath,
              target_path: imp.resolvedPath,
              import_type: imp.importType,
              imported_symbols: imp.symbols.length > 0 ? imp.symbols : null,
              scan_job_id: scanJobId,
            });
          }
        }
      } catch {
        // non-fatal: import parsing failure for this file
      }
    }

    // Bulk upsert ALL file dependencies in one DB call
    if (allDepRows.length > 0) {
      // Upsert in chunks of 500 to avoid exceeding Supabase row limits
      for (let i = 0; i < allDepRows.length; i += 500) {
        const chunk = allDepRows.slice(i, i + 500);
        await db.from("file_dependencies").upsert(chunk, {
          onConflict: "project_id,source_path,target_path",
        }).then(undefined, () => { /* non-fatal */ });
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
    // PASS 2: AI feature extraction — parallel batches in dependency order
    // ═══════════════════════════════════════════════════════════════════════════

    // Running map of already-extracted summaries keyed by file path
    const summaryMap = new Map<string, string>();

    // Concurrency for AI calls — 5 parallel extractions is a good balance
    // between speed and API rate limits. gpt-4.1-mini handles this fine.
    const AI_CONCURRENCY = 5;

    /** Process a single file through AI extraction + DB upsert */
    async function processFileAI(filePath: string) {
      const file = fileByPath.get(filePath);
      if (!file) return;

      if (!validFiles.has(filePath)) {
        filesProcessed++;
        return;
      }

      // Use cached content (already in memory from tarball or per-file fetch)
      const content = contentCache.get(filePath);
      if (!content) {
        filesProcessed++;
        return;
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
          return;
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
            return;
          }
          featureId = newFeature.id;
          featuresCreated++;
        }

        featureIdSet.add(featureId);
        fileToFeatureId.set(filePath, featureId);

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

    // Process in topological tiers: files at the same depth can run in parallel
    // since they don't depend on each other. This maintains import context quality
    // while maximizing parallelism.
    const tiers = topologicalTiers(sortedFiles, importGraph);

    for (const tier of tiers) {
      // Check cancellation between tiers
      if (await isCancelled()) throw new Error("Scan cancelled by user");

      // Process this tier's files in parallel batches of AI_CONCURRENCY
      for (let i = 0; i < tier.length; i += AI_CONCURRENCY) {
        const batch = tier.slice(i, i + AI_CONCURRENCY);
        await Promise.all(batch.map(processFileAI));
      }
    }

    // Free content cache — no longer needed
    contentCache.clear();

    // ═══════════════════════════════════════════════════════════════════════════
    // PASS 3: Build entity relations from import graph + feature mappings
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      // Look up user_id for this project (needed for entity_relations)
      const { data: projectOwner } = await db
        .from("projects")
        .select("user_id")
        .eq("id", projectId)
        .single();

      if (projectOwner?.user_id && fileToFeatureId.size > 0) {
        const userId = projectOwner.user_id;

        // Build feature→feature relations from the import graph
        // If file A imports file B, and A maps to feature X and B maps to feature Y,
        // then feature X depends_on feature Y
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

        for (const [sourcePath, targets] of importGraph) {
          const sourceFeatureId = fileToFeatureId.get(sourcePath);
          if (!sourceFeatureId) continue;

          for (const targetPath of targets) {
            const targetFeatureId = fileToFeatureId.get(targetPath);
            if (!targetFeatureId || targetFeatureId === sourceFeatureId) continue;

            // Deduplicate: same feature pair + relation
            const key = `${sourceFeatureId}:${targetFeatureId}:depends_on`;
            if (seenRelations.has(key)) continue;
            seenRelations.add(key);

            relationRows.push({
              project_id: projectId,
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
                scan_job_id: scanJobId,
              },
            });
          }
        }

        // Clear stale relations from previous scans for this project
        await db
          .from("entity_relations" as never)
          .delete()
          .eq("project_id", projectId)
          .eq("relation", "depends_on")
          .eq("source_type", "feature")
          .eq("target_type", "feature");

        // Bulk insert in chunks
        if (relationRows.length > 0) {
          for (let i = 0; i < relationRows.length; i += 500) {
            const chunk = relationRows.slice(i, i + 500);
            await db.from("entity_relations" as never).insert(chunk as never).then(undefined, () => { /* non-fatal */ });
          }

          await pushLog(
            { timestamp: new Date().toISOString(), file: "", status: "done", message: `Built ${relationRows.length} feature dependency relations` },
            { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
          );
        }
      }
    } catch {
      // Non-fatal: entity relations are supplementary
      await pushLog(
        { timestamp: new Date().toISOString(), file: "", status: "skipped", message: "Entity relations building skipped (non-fatal error)" },
        { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
      );
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

/**
 * Group files into tiers by dependency depth. Files in the same tier have all
 * their dependencies in earlier tiers, so they can be processed in parallel.
 * This maximizes AI concurrency while maintaining import context quality.
 */
function topologicalTiers(
  sortedFiles: string[],
  importGraph: Map<string, string[]>,
): string[][] {
  const pathSet = new Set(sortedFiles);
  const depth = new Map<string, number>();

  // Compute depth: max dependency depth + 1
  for (const path of sortedFiles) {
    let maxDepth = -1;
    for (const dep of importGraph.get(path) ?? []) {
      if (pathSet.has(dep) && depth.has(dep)) {
        maxDepth = Math.max(maxDepth, depth.get(dep)!);
      }
    }
    depth.set(path, maxDepth + 1);
  }

  // Group by depth
  const tierMap = new Map<number, string[]>();
  for (const path of sortedFiles) {
    const d = depth.get(path) ?? 0;
    const tier = tierMap.get(d) ?? [];
    tier.push(path);
    tierMap.set(d, tier);
  }

  // Return tiers in order (depth 0 first)
  const maxTier = Math.max(...tierMap.keys(), 0);
  const tiers: string[][] = [];
  for (let i = 0; i <= maxTier; i++) {
    const tier = tierMap.get(i);
    if (tier && tier.length > 0) tiers.push(tier);
  }
  return tiers;
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
