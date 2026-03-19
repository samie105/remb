/**
 * Core scan pipeline. Lives outside "use server" so it can run inside an
 * API route handler that has a proper maxDuration budget.
 *
 * Chunked scanning: large repos are processed CHUNK_SIZE files per invocation.
 * Each invocation fires the next one (fire-and-forget) before returning, so
 * there is no single-function timeout cap. The queued file list and running
 * totals are persisted in scan_jobs.result between chunks (prefixed with _).
 */

import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  getRepoFiles,
  getFileContent,
  getLatestCommitSha,
  getRembIgnorePatterns,
  parseIgnorePatterns,
  processInBatches,
} from "@/lib/github-reader";
import { extractFeaturesFromFile, generateEmbedding } from "@/lib/openai";
import { extractImports, getInternalImports } from "@/lib/import-parser";
import type { ScanLogEntry, ScanResult } from "@/lib/scan-actions";

/** Files processed per serverless invocation. Keeps each call well under Vercel's limit. */
const CHUNK_SIZE = 15;

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
  /** Index into the queued file list to start from. 0 = initial call (setup + first chunk). */
  chunkOffset = 0,
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
      // Internal chunking fields consumed by continuation calls
      _queued_files: queuedFiles,
      _scan_start_ms: scanStartMs,
      _commit_sha: commitSha,
      _resolved_branch: resolvedBranch,
      _feature_ids: [...featureIdSet],
      _file_index: [...fileIndex],
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

  async function pushLog(entry: ScanLogEntry, partialResult: Partial<ScanResult>) {
    logs.push(entry);
    // Flush to DB every 5 log entries (or immediately on errors) so the UI can poll progress
    if (logs.length % 5 === 0 || entry.status === "error") {
      await db
        .from("scan_jobs")
        .update({ result: buildJobResult(partialResult) as Json })
        .eq("id", scanJobId);
    }
  }

  try {
    if (chunkOffset === 0) {
      // ══════════════════════════════════════════════════════════════════════════
      // INITIAL CALL — fetch file tree, build smart-scan filter, store queue
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

    // Persist the full queue and initial state to DB so continuation chunks can
    // pick up where this invocation left off without re-fetching the file tree.
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

    } else {
      // ══════════════════════════════════════════════════════════════════════════
      // CONTINUATION CALL — restore state persisted by a previous chunk
      // ══════════════════════════════════════════════════════════════════════════
      const { data: jobRow } = await db
        .from("scan_jobs")
        .select("result")
        .eq("id", scanJobId)
        .single();

      if (!jobRow?.result) throw new Error("Cannot resume scan: job state not found in DB");

      const saved = jobRow.result as Record<string, unknown>;

      queuedFiles   = (saved._queued_files  as typeof queuedFiles)           ?? [];
      scanStartMs   = (saved._scan_start_ms  as number)                       ?? Date.now();
      commitSha     = saved._commit_sha       as string | undefined;
      resolvedBranch = (saved._resolved_branch as string)                     ?? branch;
      filesTotal    = (saved.files_total      as number)                      ?? 0;
      filesProcessed = (saved.files_scanned   as number)                      ?? 0;
      featuresCreated = (saved.features_created as number)                    ?? 0;
      entriesCreated  = (saved.entries_created  as number)                    ?? 0;
      errors          = (saved.errors           as number)                    ?? 0;
      logs            = [...((saved.logs ?? []) as ScanLogEntry[])];

      for (const t of (saved.tech_stack ?? []) as string[])       techStackSet.add(t);
      Object.assign(languages, (saved.languages ?? {}) as Record<string, number>);
      for (const id of (saved._feature_ids ?? []) as string[])    featureIdSet.add(id);
      fileIndex = new Set((saved._file_index ?? []) as string[]);

      const chunkNum = Math.floor(chunkOffset / CHUNK_SIZE) + 1;
      logs.push({
        timestamp: new Date().toISOString(),
        file: "",
        status: "scanning",
        message: `Resuming scan — chunk ${chunkNum}: files ${chunkOffset + 1}–${Math.min(chunkOffset + CHUNK_SIZE, queuedFiles.length)} of ${queuedFiles.length}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHUNK PROCESSING — same logic regardless of initial vs continuation call
    // ═══════════════════════════════════════════════════════════════════════════
    const chunkFiles = queuedFiles.slice(chunkOffset, chunkOffset + CHUNK_SIZE);
    const nextOffset = chunkOffset + CHUNK_SIZE;
    const hasMoreChunks = nextOffset < queuedFiles.length;

    // 2. Process this chunk's files in batches of 3 (low concurrency avoids OpenAI rate limits)
    await processInBatches(chunkFiles, 3, async (file) => {
      // Check if the scan was cancelled between batches
      const { data: jobCheck } = await db
        .from("scan_jobs")
        .select("status")
        .eq("id", scanJobId)
        .single();

      if (jobCheck?.status === "failed") {
        throw new Error("Scan cancelled by user");
      }

      const fileStart = Date.now();
      try {
        await pushLog(
          { timestamp: new Date().toISOString(), file: file.path, status: "scanning", message: `Analyzing ${file.path}` },
          { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
        );

        const content = await getFileContent(githubToken, repoName, file.path);

        // Skip files larger than 100 KB — they cost too much to process via AI
        // and rarely yield better features than smaller files.
        if (content.length > 100_000) {
          filesProcessed++;
          await pushLog(
            { timestamp: new Date().toISOString(), file: file.path, status: "skipped", elapsed_ms: Date.now() - fileStart, message: `Skipped: file too large (${Math.round(content.length / 1024)} KB)` },
            { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
          );
          return;
        }

        // ── Extract imports (fast regex — no LLM cost) ──────────────────────
        try {
          const allImports = extractImports(content, file.path, fileIndex);
          const internalImports = getInternalImports(allImports);

          if (internalImports.length > 0) {
            // Upsert file dependencies — ON CONFLICT updates symbols + type
            const rows = internalImports.map((imp) => ({
              project_id: projectId,
              source_path: file.path,
              target_path: imp.resolvedPath!,
              import_type: imp.importType,
              imported_symbols: imp.symbols.length > 0 ? imp.symbols : null,
              scan_job_id: scanJobId,
            }));

            await db.from("file_dependencies").upsert(rows, {
              onConflict: "project_id,source_path,target_path",
            });
          }
        } catch {
          // Non-fatal: import extraction failure shouldn't block the scan
        }

        const extracted = await withRetry(() => extractFeaturesFromFile(content, file.path));

        if (!extracted) {
          filesProcessed++;
          await pushLog(
            { timestamp: new Date().toISOString(), file: file.path, status: "skipped", elapsed_ms: Date.now() - fileStart, message: "No features extracted" },
            { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
          );
          return;
        }

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

        const contextContent = JSON.stringify({
          summary: extracted.summary,
          category: extracted.category,
          importance: extracted.importance,
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

        const { error: entryError } = await db.from("context_entries").insert({
          feature_id: featureId,
          content: contextContent,
          entry_type: "scan",
          source: "worker",
          metadata: {
            file_path: file.path,
            file_sha: file.sha,
            scan_job_id: scanJobId,
            feature_name: extracted.feature_name,
            category: extracted.category,
            importance: extracted.importance,
            tags: extracted.tags,
            dependencies: extracted.dependencies,
          },
          ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
        });

        if (entryError) {
          errors++;
        } else {
          entriesCreated++;
        }

        filesProcessed++;
        await pushLog(
          { timestamp: new Date().toISOString(), file: file.path, status: "done", feature: extracted.feature_name, elapsed_ms: Date.now() - fileStart, message: `Extracted: ${extracted.feature_name}` },
          { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
        );
      } catch (e) {
        errors++;
        filesProcessed++;
        await pushLog(
          { timestamp: new Date().toISOString(), file: file.path, status: "error", elapsed_ms: Date.now() - fileStart, message: e instanceof Error ? e.message : "Unknown error" },
          { files_total: filesTotal, files_scanned: filesProcessed, features_created: featuresCreated, entries_created: entriesCreated, errors, duration_ms: Date.now() - scanStartMs },
        );
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. Chain to next chunk OR finalize
    // ═══════════════════════════════════════════════════════════════════════════
    if (hasMoreChunks) {
      // Persist current progress and hand off to the next invocation.
      await db
        .from("scan_jobs")
        .update({
          result: buildJobResult({
            files_total: filesTotal,
            files_scanned: filesProcessed,
            features_created: featuresCreated,
            entries_created: entriesCreated,
            errors,
            duration_ms: Date.now() - scanStartMs,
          }) as Json,
        })
        .eq("id", scanJobId);

      // Fire-and-forget: the next chunk runs in its own serverless invocation.
      chainNextChunk(scanJobId, projectId, repoName, resolvedBranch, githubToken, nextOffset);

      return {
        files_total: filesTotal,
        files_scanned: filesProcessed,
        features_created: featuresCreated,
        entries_created: entriesCreated,
        errors,
        duration_ms: Date.now() - scanStartMs,
        logs,
        tech_stack: [...techStackSet],
        languages,
      };
    }

    // Final write — strip internal fields and mark done
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
    await db
      .from("scan_jobs")
      .update({
        status: "failed",
        result: {
          error: err instanceof Error ? err.message : String(err),
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
 * Fire the next chunk as a new serverless invocation (fire-and-forget).
 * This allows arbitrarily large repos to be scanned without hitting any single
 * function's timeout — each invocation handles CHUNK_SIZE files.
 */
function chainNextChunk(
  scanJobId: string,
  projectId: string,
  repoName: string,
  branch: string,
  githubToken: string,
  chunkOffset: number,
) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const secret = process.env.SCAN_WORKER_SECRET?.trim();
  if (!secret) {
    console.error(`[scan-runner] SCAN_WORKER_SECRET is not set — cannot chain next chunk (offset ${chunkOffset}). Scan will stop here.`);
    return;
  }

  fetch(`${appUrl}/api/scan/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ scanJobId, projectId, repoName, branch, githubToken, chunkOffset }),
  }).catch((err) => {
    console.error(`[scan-runner] Failed to chain chunk at offset ${chunkOffset}:`, err);
  });
}

function triggerQueueProcessing() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const secret = process.env.SCAN_WORKER_SECRET?.trim();
  if (!secret) return;

  fetch(`${appUrl}/api/scan/process-queue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
  }).catch((err) => {
    console.error("[scan-runner] Failed to trigger queue processing:", err);
  });
}
