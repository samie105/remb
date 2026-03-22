/**
 * Multi-agent scan coordinator.
 *
 * Orchestrates the scanning pipeline as a series of phases, each backed by
 * specialised "agents" (Trigger.dev tasks or in-process functions). Inspired by
 * Understand-Anything's 7-phase multi-agent architecture, adapted for Remb's
 * cloud-first stack (Trigger.dev workers + Supabase).
 *
 * Phase map:
 *   1. SCOUT   — Fetch file tree, smart-scan dedup, tarball download, import graph
 *   2. ANALYZE — Parallel batch tasks: AI extraction → code_nodes / code_edges
 *   3. ARCHITECT — LLM architecture analysis: semantic layers, cross-cutting concerns
 *   4. REVIEW  — Graph validation, edge resolution, quality gate
 *   5. FINALIZE — Mark scan done, trigger continuation
 */

import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { ScanLogEntry, ScanResult } from "@/lib/scan-actions";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScanPhase = "scout" | "analyze" | "architect" | "review" | "finalize";

export interface PhaseResult {
  phase: ScanPhase;
  status: "success" | "partial" | "skipped" | "failed";
  duration_ms: number;
  message: string;
  stats?: Record<string, number>;
}

/**
 * Intermediate state passed between phases through the coordinator.
 * Stored in-memory during a single scan run, NOT persisted (except via scan_jobs.result).
 */
export interface ScanState {
  // ── Identity ──
  scanJobId: string;
  projectId: string;
  repoName: string;
  branch: string;
  githubToken: string;

  // ── Config ──
  chainId: string;
  batchNumber: number;
  scanStartMs: number;

  // ── Mutable counters ──
  filesTotal: number;
  filesProcessed: number;
  featuresCreated: number;
  entriesCreated: number;
  errors: number;
  languages: Record<string, number>;
  techStack: Set<string>;
  featureIds: Set<string>;
  commitSha?: string;

  // ── Logs ──
  logs: ScanLogEntry[];

  // ── Phase 1 outputs (consumed by Phase 2+) ──
  /** Queued files to process (path + sha) */
  queuedFiles: Array<{ path: string; sha: string }>;
  /** All repo file paths for import resolution */
  fileIndex: Set<string>;
  /** Source → [target] import graph */
  importGraph: Map<string, string[]>;
  /** Target → [source] reverse import graph */
  reverseGraph: Map<string, string[]>;
  /** Per-file import details for AI context */
  fileImports: Map<string, Array<{ path: string; symbols: string[] }>>;
  /** Content cache from tarball download */
  contentCache: Map<string, string>;
  /** Files that were successfully indexed */
  validFiles: Set<string>;
  /** Topologically sorted files (leaves first) */
  sortedFiles: string[];
  /** Files remaining after MAX_FILES cap */
  filesRemaining: number;

  // ── Phase 2 outputs (consumed by Phase 3+) ──
  /** file_path → feature_id mapping */
  fileToFeatureId: Map<string, string>;
  /** file_path → AI summary (used for import context) */
  summaryMap: Map<string, string>;

  // ── Phase results ──
  phaseResults: PhaseResult[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_IN_MEMORY_LOGS = 500;

// ─── Coordinator ─────────────────────────────────────────────────────────────

/**
 * Create an initial scan state from payload + chain metadata.
 */
export function createScanState(
  scanJobId: string,
  projectId: string,
  repoName: string,
  branch: string,
  githubToken: string,
  chainId: string,
  batchNumber: number,
): ScanState {
  return {
    scanJobId,
    projectId,
    repoName,
    branch,
    githubToken,
    chainId,
    batchNumber,
    scanStartMs: Date.now(),
    filesTotal: 0,
    filesProcessed: 0,
    featuresCreated: 0,
    entriesCreated: 0,
    errors: 0,
    languages: {},
    techStack: new Set(),
    featureIds: new Set(),
    commitSha: undefined,
    logs: [],
    queuedFiles: [],
    fileIndex: new Set(),
    importGraph: new Map(),
    reverseGraph: new Map(),
    fileImports: new Map(),
    contentCache: new Map(),
    validFiles: new Set(),
    sortedFiles: [],
    filesRemaining: 0,
    fileToFeatureId: new Map(),
    summaryMap: new Map(),
    phaseResults: [],
  };
}

/**
 * Push a log entry and flush to DB. Caps in-memory logs.
 */
export async function pushLog(
  state: ScanState,
  entry: ScanLogEntry,
): Promise<void> {
  state.logs.push(entry);
  if (state.logs.length > MAX_IN_MEMORY_LOGS) {
    state.logs.splice(0, state.logs.length - MAX_IN_MEMORY_LOGS);
  }

  const recentLogs = state.logs.length > 200 ? state.logs.slice(-200) : state.logs;
  const db = createAdminClient();
  await db
    .from("scan_jobs")
    .update({
      result: {
        files_total: state.filesTotal,
        files_scanned: state.filesProcessed,
        features_created: state.featuresCreated,
        entries_created: state.entriesCreated,
        errors: state.errors,
        duration_ms: Date.now() - state.scanStartMs,
        logs: recentLogs,
        tech_stack: [...state.techStack],
        languages: state.languages,
        phases: state.phaseResults,
      } as unknown as Json,
    })
    .eq("id", state.scanJobId);
}

/**
 * Check if scan was cancelled by user.
 */
export async function isCancelled(scanJobId: string): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("scan_jobs")
      .select("status")
      .eq("id", scanJobId)
      .single();
    return data?.status === "failed";
  } catch {
    return false;
  }
}

/**
 * Build final ScanResult from state.
 */
export function buildFinalResult(state: ScanState): ScanResult {
  return {
    files_total: state.filesTotal,
    files_scanned: state.filesProcessed,
    features_created: state.featuresCreated,
    entries_created: state.entriesCreated,
    errors: state.errors,
    duration_ms: Date.now() - state.scanStartMs,
    logs: state.logs,
    tech_stack: [...state.techStack],
    languages: state.languages,
    commit_sha: state.commitSha,
    feature_ids: [...state.featureIds],
    files_remaining: state.filesRemaining,
    _chain_id: state.chainId,
    _batch_number: state.batchNumber,
  };
}

/**
 * Record a phase result.
 */
export function recordPhase(
  state: ScanState,
  result: PhaseResult,
): void {
  state.phaseResults.push(result);
}

/**
 * Track file for language/tech detection.
 */
export function trackFile(state: ScanState, filePath: string): void {
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
  if (lang) state.languages[lang] = (state.languages[lang] ?? 0) + 1;

  if (filePath.includes("next.config")) state.techStack.add("Next.js");
  if (filePath.includes("tailwind")) state.techStack.add("Tailwind CSS");
  if (filePath.includes("prisma")) state.techStack.add("Prisma");
  if (filePath.includes("docker") || filePath.includes("Dockerfile")) state.techStack.add("Docker");
  if (filePath.includes("supabase")) state.techStack.add("Supabase");
  if (filePath.endsWith("package.json")) state.techStack.add("Node.js");
  if (filePath.endsWith("go.mod")) state.techStack.add("Go");
  if (filePath.endsWith("Cargo.toml")) state.techStack.add("Rust");
  if (filePath.endsWith("requirements.txt") || filePath.endsWith("pyproject.toml")) state.techStack.add("Python");
}
