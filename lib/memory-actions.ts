"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { generateEmbedding } from "@/lib/openai";
import type { MemoryRow, MemoryTier, MemoryCategory, UserRow } from "@/lib/supabase/types";

/* ─── helpers ─── */

async function requireUser(): Promise<UserRow> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.dbUser;
}

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/* ─── types ─── */

export type MemoryWithProject = MemoryRow & {
  project_name: string | null;
  image_count: number;
};

export type MemoryStats = {
  total: number;
  byTier: Record<MemoryTier, { count: number; tokens: number }>;
  byCategory: Record<MemoryCategory, number>;
  quota?: {
    memoryCount: number;
    maxMemories: number;
    totalTokens: number;
    maxTokenBudget: number;
    memoryBytes: number;
    maxMemoryBytes: number;
    plan: string;
  };
};

export type CreateMemoryInput = {
  projectId?: string;
  featureId?: string;
  tier?: MemoryTier;
  category?: MemoryCategory;
  title: string;
  content: string;
  tags?: string[];
};

export type UpdateMemoryInput = {
  id: string;
  title?: string;
  content?: string;
  category?: MemoryCategory;
  tags?: string[];
};

/* ─── CRUD ─── */

export async function getMemories(options?: {
  projectId?: string;
  tier?: MemoryTier;
  category?: MemoryCategory;
}): Promise<MemoryWithProject[]> {
  const user = await requireUser();
  const db = createAdminClient();

  let query = db
    .from("memories")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (options?.tier) query = query.eq("tier", options.tier);
  if (options?.category) query = query.eq("category", options.category);
  if (options?.projectId) {
    query = query.or(`project_id.eq.${options.projectId},project_id.is.null`);
  }

  const { data: memories, error } = await query;
  if (error) throw new Error(error.message);

  // Attach project names
  const projectIds = [...new Set((memories ?? []).map((m) => m.project_id).filter(Boolean))] as string[];
  const projectMap = new Map<string, string>();

  if (projectIds.length > 0) {
    const { data: projects } = await db
      .from("projects")
      .select("id, name")
      .in("id", projectIds);

    for (const p of projects ?? []) {
      projectMap.set(p.id, p.name);
    }
  }

  // Fetch image counts per memory
  const memoryIds = (memories ?? []).map((m) => m.id);
  const imageCountMap = new Map<string, number>();

  if (memoryIds.length > 0) {
    const { data: imgCounts } = await db
      .from("memory_images")
      .select("memory_id")
      .in("memory_id", memoryIds);

    for (const row of imgCounts ?? []) {
      imageCountMap.set(row.memory_id, (imageCountMap.get(row.memory_id) ?? 0) + 1);
    }
  }

  return (memories ?? []).map((m) => ({
    ...m,
    project_name: m.project_id ? projectMap.get(m.project_id) ?? null : null,
    image_count: imageCountMap.get(m.id) ?? 0,
  }));
}

export async function createMemory(input: CreateMemoryInput): Promise<MemoryRow> {
  const user = await requireUser();
  const db = createAdminClient();

  const tokenCount = estimateTokens(input.content);

  // Plan-level content size guard
  const { data: limits } = await db
    .from("plan_limits")
    .select("max_memory_bytes, max_memories")
    .eq("plan", user.plan ?? "free")
    .single();

  if (limits) {
    const bytes = new TextEncoder().encode(input.content).length;
    if (bytes > limits.max_memory_bytes) {
      throw new Error(`Content exceeds plan limit (${limits.max_memory_bytes} bytes). Shorten the content or upgrade your plan.`);
    }
  }

  // Quota check — are we under the plan memory count?
  const { data: withinQuota } = await db.rpc("check_memory_quota", { p_user_id: user.id });
  if (withinQuota === false) {
    throw new Error("Memory quota reached. Delete or archive existing memories, or upgrade your plan.");
  }

  // Enforce core tier limit (max 20 core memories to keep token budget low)
  if (input.tier === "core") {
    const { count } = await db
      .from("memories")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("tier", "core");

    if ((count ?? 0) >= 20) {
      throw new Error("Core memory limit reached (max 20). Demote existing core memories first.");
    }
  }

  // Generate embedding for semantic retrieval
  let embedding: string | null = null;
  try {
    const vector = await generateEmbedding(`${input.title}\n${input.content}`);
    embedding = JSON.stringify(vector);
  } catch {
    // Non-blocking: memory still works without embedding
  }

  const { data, error } = await db
    .from("memories")
    .insert({
      user_id: user.id,
      project_id: input.projectId ?? null,
      feature_id: input.featureId ?? null,
      tier: input.tier ?? "active",
      category: input.category ?? "general",
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      token_count: tokenCount,
      embedding,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create memory");

  // Fire-and-forget: check for contradictions with existing memories
  if (embedding) {
    void detectContradictions(db, user.id, data.id, input.projectId ?? null, embedding)
      .catch(() => {});
  }

  return data;
}

export async function updateMemory(input: UpdateMemoryInput): Promise<MemoryRow> {
  const user = await requireUser();
  const db = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.content !== undefined) {
    updates.content = input.content;
    updates.token_count = estimateTokens(input.content);
  }
  if (input.category !== undefined) updates.category = input.category;
  if (input.tags !== undefined) updates.tags = input.tags;

  // Re-generate embedding if content changed
  if (input.content !== undefined || input.title !== undefined) {
    try {
      const text = `${input.title ?? ""}\n${input.content ?? ""}`;
      const vector = await generateEmbedding(text);
      updates.embedding = JSON.stringify(vector);
    } catch {
      // Non-blocking
    }
  }

  const { data, error } = await db
    .from("memories")
    .update(updates)
    .eq("id", input.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update memory");
  return data;
}

export async function deleteMemory(id: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { error } = await db
    .from("memories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/* ─── Tier management ─── */

export async function changeTier(id: string, newTier: MemoryTier): Promise<MemoryRow> {
  const user = await requireUser();
  const db = createAdminClient();

  // Enforce core limit
  if (newTier === "core") {
    const { count } = await db
      .from("memories")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("tier", "core");

    if ((count ?? 0) >= 20) {
      throw new Error("Core memory limit reached (max 20).");
    }
  }

  const updates: Record<string, unknown> = { tier: newTier };

  // When archiving, generate compressed content
  if (newTier === "archive") {
    const { data: memory } = await db
      .from("memories")
      .select("content, title")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (memory) {
      updates.compressed_content = await compressContent(memory.title, memory.content);
    }
  }

  // When promoting from archive, clear compressed content
  if (newTier !== "archive") {
    updates.compressed_content = null;
  }

  const { data, error } = await db
    .from("memories")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to change tier");
  return data;
}

/** AI-powered content compression using GPT-4.1-nano.
 *  Falls back to simple extraction if the AI call fails. */
async function compressContent(title: string, content: string): Promise<string> {
  // Short content doesn't need compression
  if (content.length < 200) return content;

  try {
    const { getOpenAI } = await import("@/lib/openai");
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-nano",
      max_tokens: 300,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Compress the following memory into a dense, information-preserving summary. " +
            "Keep all key facts, decisions, code patterns, and technical details. " +
            "Remove redundancy, filler, and obvious context. " +
            "Target ~30% of the original length. Output ONLY the compressed text.",
        },
        { role: "user", content: `Title: ${title}\n\n${content}` },
      ],
    });
    const compressed = response.choices[0]?.message?.content?.trim();
    if (compressed && compressed.length > 0) return compressed;
  } catch {
    /* fall through to simple extraction */
  }

  // Fallback: extract key sentences
  const sentences = content.split(/[.!?\n]+/).filter((s) => s.trim().length > 10);
  if (sentences.length <= 3) return content;
  return `${title}: ${[
    sentences[0],
    sentences[Math.floor(sentences.length / 2)],
    sentences[sentences.length - 1],
  ].map((s) => s.trim()).join(". ")}.`;
}

/* ─── Stats ─── */

export async function getMemoryStats(options?: {
  projectId?: string;
}): Promise<MemoryStats> {
  const user = await requireUser();
  const db = createAdminClient();

  let query = db
    .from("memories")
    .select("tier, category, token_count, project_id")
    .eq("user_id", user.id);

  if (options?.projectId) {
    query = query.or(
      `project_id.eq.${options.projectId},project_id.is.null`,
    );
  }

  const { data: memories, error } = await query;

  if (error) throw new Error(error.message);

  const stats: MemoryStats = {
    total: memories?.length ?? 0,
    byTier: {
      core: { count: 0, tokens: 0 },
      active: { count: 0, tokens: 0 },
      archive: { count: 0, tokens: 0 },
    },
    byCategory: {
      preference: 0,
      pattern: 0,
      decision: 0,
      correction: 0,
      knowledge: 0,
      general: 0,
    },
  };

  for (const m of memories ?? []) {
    const tier = m.tier as MemoryTier;
    const cat = m.category as MemoryCategory;
    stats.byTier[tier].count++;
    stats.byTier[tier].tokens += m.token_count;
    stats.byCategory[cat]++;
  }

  // Attach quota info from the DB view (cheap — single row)
  const { data: storageRow } = await db
    .from("user_storage_stats")
    .select("memory_count, max_memories, total_memory_tokens, max_token_budget, memory_bytes, max_memory_bytes, plan")
    .eq("user_id", user.id)
    .single();

  if (storageRow) {
    stats.quota = {
      memoryCount: storageRow.memory_count,
      maxMemories: storageRow.max_memories,
      totalTokens: storageRow.total_memory_tokens,
      maxTokenBudget: storageRow.max_token_budget,
      memoryBytes: Number(storageRow.memory_bytes),
      maxMemoryBytes: storageRow.max_memory_bytes,
      plan: storageRow.plan,
    };
  }

  return stats;
}

/* ─── Access tracking ─── */

export async function recordAccess(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await requireUser();
  const db = createAdminClient();

  // Single atomic RPC — updates access_count + last_accessed_at for all IDs
  await db.rpc("touch_memories", { memory_ids: ids });
}

/* ─── Context loading (tiered) ─── */

/** Budget-aware context loading — uses the DB's build_context_bundle() for smart ranking.
 *  Single RPC call replaces multiple queries + app-layer sorting.
 *  Returns memories ordered by priority within token budget. */
export async function loadContextWithBudget(options?: {
  projectId?: string;
  query?: string;
  tokenBudget?: number;
}): Promise<{ memories: Array<{ id: string; tier: string; category: string; title: string; content: string; tags: string[]; token_count: number; access_count: number; similarity: number }>; totalTokens: number }> {
  const user = await requireUser();
  const db = createAdminClient();

  // Resolve plan budget if not specified
  let budget = options?.tokenBudget;
  if (!budget) {
    const { data: limits } = await db
      .from("plan_limits")
      .select("max_token_budget")
      .eq("plan", user.plan ?? "free")
      .single();
    budget = limits?.max_token_budget ?? 16000;
  }

  // Optional semantic embedding
  let embedding: string | null = null;
  if (options?.query) {
    try {
      const vector = await generateEmbedding(options.query);
      embedding = JSON.stringify(vector);
    } catch { /* fallback: priority-only ranking */ }
  }

  const { data, error } = await db.rpc("build_context_bundle", {
    p_user_id: user.id,
    p_project_id: options?.projectId ?? null,
    query_embedding: embedding,
    token_budget: budget,
  });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; tier: string; category: string; title: string; content: string; tags: string[]; token_count: number; access_count: number; similarity: number; cumulative_tokens: number }>;

  // Touch all returned memories in one shot
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.rpc("touch_memories", { memory_ids: ids });
  }

  const totalTokens = rows.length > 0 ? Number(rows[rows.length - 1].cumulative_tokens) : 0;

  return {
    memories: rows.map((r) => ({
      id: r.id,
      tier: r.tier,
      category: r.category,
      title: r.title,
      content: r.content,
      tags: r.tags,
      token_count: r.token_count,
      access_count: r.access_count,
      similarity: r.similarity,
    })),
    totalTokens,
  };
}

/** Load core memories (always included in AI context) */
export async function loadCoreMemories(projectId?: string): Promise<MemoryRow[]> {
  const user = await requireUser();
  const db = createAdminClient();

  let query = db
    .from("memories")
    .select("*")
    .eq("user_id", user.id)
    .eq("tier", "core")
    .order("access_count", { ascending: false });

  if (projectId) {
    query = query.or(`project_id.eq.${projectId},project_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Load relevant active memories via semantic search */
export async function loadRelevantMemories(
  query: string,
  projectId?: string,
  limit: number = 5
): Promise<MemoryRow[]> {
  const user = await requireUser();
  const db = createAdminClient();

  let embedding: number[];
  try {
    embedding = await generateEmbedding(query);
  } catch {
    // Fallback: return most recently accessed active memories
    let fallbackQuery = db
      .from("memories")
      .select("*")
      .eq("user_id", user.id)
      .eq("tier", "active")
      .order("last_accessed_at", { ascending: false })
      .limit(limit);

    if (projectId) {
      fallbackQuery = fallbackQuery.or(`project_id.eq.${projectId},project_id.is.null`);
    }

    const { data } = await fallbackQuery;
    return data ?? [];
  }

  const { data, error } = await db.rpc("search_memories", {
    p_user_id: user.id,
    p_project_id: projectId ?? undefined,
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
    p_tier: "active",
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MemoryRow[];
}

/* ─── Generate memories from project analysis ─── */

export type GenerateMemoriesResult = {
  created: number;
  memories: MemoryRow[];
};

export async function generateProjectMemories(
  projectId: string,
): Promise<GenerateMemoriesResult> {
  const user = await requireUser();
  const db = createAdminClient();

  // Verify project ownership
  const { data: project } = await db
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) throw new Error("Project not found");

  // Gather all features with their context entries
  const { data: features } = await db
    .from("features")
    .select("id, name, description, status")
    .eq("project_id", projectId)
    .order("name");

  if (!features?.length) {
    throw new Error("No features found. Run a scan first to generate features.");
  }

  const featureIds = features.map((f) => f.id);
  const { data: entries } = await db
    .from("context_entries")
    .select("feature_id, metadata, content")
    .in("feature_id", featureIds);

  // Get latest scan result for tech stack
  const { data: latestScan } = await db
    .from("scan_jobs")
    .select("result")
    .eq("project_id", projectId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const scanResult = latestScan?.result as Record<string, unknown> | null;
  const techStack = Array.isArray(scanResult?.tech_stack) ? (scanResult.tech_stack as string[]) : [];

  // Build feature summaries for AI
  type FeatureCategory = "core" | "ui" | "data" | "infra" | "integration";
  const featureSummaries = features.map((f) => {
    const fEntries = (entries ?? []).filter((e) => e.feature_id === f.id);
    const files: string[] = [];
    const tags: string[] = [];
    const categoryCounts = new Map<string, number>();
    const importanceValues: number[] = [];
    const contentSnippets: string[] = [];

    for (const e of fEntries) {
      const meta = e.metadata as Record<string, unknown> | null;
      if (meta?.file_path) files.push(meta.file_path as string);
      if (Array.isArray(meta?.tags)) tags.push(...(meta.tags as string[]));
      if (meta?.category) {
        const c = meta.category as string;
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
      if (typeof meta?.importance === "number") importanceValues.push(meta.importance);
      // Collect code content samples for AI pattern analysis
      if (e.content && contentSnippets.length < 2) {
        contentSnippets.push(e.content.slice(0, 400));
      }
    }

    let category: FeatureCategory = "core";
    let maxVotes = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxVotes || (count === maxVotes && cat !== "core")) {
        category = cat as FeatureCategory;
        maxVotes = count;
      }
    }

    const importance = importanceValues.length > 0
      ? Math.round(importanceValues.reduce((s, v) => s + v, 0) / importanceValues.length)
      : 5;

    return {
      name: f.name,
      description: f.description,
      category,
      importance,
      files: [...new Set(files)],
      tags: [...new Set(tags)],
      contentSnippets,
    };
  });

  // Call AI to synthesize memories
  const { synthesizeMemories } = await import("@/lib/openai");
  const synthesized = await synthesizeMemories(project.name, featureSummaries, techStack);

  if (synthesized.length === 0) {
    throw new Error("AI could not generate memories from the project data. Try running a scan first.");
  }

  // Create memory records
  const created: MemoryRow[] = [];
  for (const mem of synthesized) {
    const tokenCount = estimateTokens(mem.content);

    let embedding: string | null = null;
    try {
      const vector = await generateEmbedding(`${mem.title}\n${mem.content}`);
      embedding = JSON.stringify(vector);
    } catch {
      // Non-blocking
    }

    const { data, error } = await db
      .from("memories")
      .insert({
        user_id: user.id,
        project_id: projectId,
        tier: mem.importance >= 8 ? "core" : "active",
        category: mem.category as MemoryCategory,
        title: mem.title,
        content: mem.content,
        tags: mem.tags,
        token_count: tokenCount,
        embedding,
      })
      .select()
      .single();

    if (data) created.push(data);
    if (error) console.error("Failed to create memory:", error.message);
  }

  return { created: created.length, memories: created };
}

/* ─── Bundle project context for CLI/agents ─── */

export type ProjectContextBundle = {
  project: { name: string; description: string | null; techStack: string[]; languages: Record<string, number> };
  memories: Array<{ tier: string; category: string; title: string; content: string }>;
  features: Array<{ name: string; category: string; importance: number; description: string | null; files: string[] }>;
  markdown: string;
};

export async function bundleProjectContext(
  projectId: string,
): Promise<ProjectContextBundle> {
  const user = await requireUser();
  const db = createAdminClient();

  // Project metadata
  const { data: project } = await db
    .from("projects")
    .select("id, name, description")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) throw new Error("Project not found");

  // Latest scan for tech stack
  const { data: latestScan } = await db
    .from("scan_jobs")
    .select("result")
    .eq("project_id", projectId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const scanResult = latestScan?.result as Record<string, unknown> | null;
  const techStack = Array.isArray(scanResult?.tech_stack) ? (scanResult.tech_stack as string[]) : [];
  const languages = (scanResult?.languages ?? {}) as Record<string, number>;

  // Memories (core first, then active)
  const { data: memories } = await db
    .from("memories")
    .select("tier, category, title, content")
    .eq("user_id", user.id)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .in("tier", ["core", "active"])
    .order("tier")
    .order("access_count", { ascending: false })
    .limit(50);

  // Features + entries for file mapping
  const { data: features } = await db
    .from("features")
    .select("id, name, description, status")
    .eq("project_id", projectId)
    .eq("status", "active");

  const featureIds = (features ?? []).map((f) => f.id);
  const { data: entries } = featureIds.length > 0
    ? await db.from("context_entries").select("feature_id, metadata, content").in("feature_id", featureIds)
    : { data: [] };

  // Build feature summaries
  type FeatureCategory = "core" | "ui" | "data" | "infra" | "integration";
  const featureSummaries = (features ?? []).map((f) => {
    const fEntries = (entries ?? []).filter((e) => e.feature_id === f.id);
    const files: string[] = [];
    const categoryCounts = new Map<string, number>();
    const importanceValues: number[] = [];

    for (const e of fEntries) {
      const meta = e.metadata as Record<string, unknown> | null;
      if (meta?.file_path) files.push(meta.file_path as string);
      if (meta?.category) {
        const c = meta.category as string;
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
      if (typeof meta?.importance === "number") importanceValues.push(meta.importance);
    }

    let category: FeatureCategory = "core";
    let maxVotes = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxVotes || (count === maxVotes && cat !== "core")) {
        category = cat as FeatureCategory;
        maxVotes = count;
      }
    }

    return {
      name: f.name,
      category,
      importance: importanceValues.length
        ? Math.round(importanceValues.reduce((s, v) => s + v, 0) / importanceValues.length)
        : 5,
      description: f.description,
      files: [...new Set(files)],
    };
  }).sort((a, b) => b.importance - a.importance);

  // Build markdown document
  const md = buildContextMarkdown(
    { name: project.name, description: project.description, techStack, languages },
    memories ?? [],
    featureSummaries,
  );

  return {
    project: { name: project.name, description: project.description, techStack, languages },
    memories: (memories ?? []).map((m) => ({ tier: m.tier, category: m.category, title: m.title, content: m.content })),
    features: featureSummaries,
    markdown: md,
  };
}

function buildContextMarkdown(
  project: { name: string; description: string | null; techStack: string[]; languages: Record<string, number> },
  memories: Array<{ tier: string; category: string; title: string; content: string }>,
  features: Array<{ name: string; category: string; importance: number; description: string | null; files: string[] }>,
): string {
  const lines: string[] = [];

  lines.push(`# ${project.name} — Project Context`);
  lines.push("");
  lines.push(`> Auto-generated by Remb. Last updated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");

  if (project.description) {
    lines.push(project.description);
    lines.push("");
  }

  if (project.techStack.length > 0) {
    lines.push(`**Tech Stack:** ${project.techStack.join(", ")}`);
    lines.push("");
  }

  const langEntries = Object.entries(project.languages).sort((a, b) => b[1] - a[1]);
  if (langEntries.length > 0) {
    lines.push(`**Languages:** ${langEntries.map(([l, c]) => `${l} (${c})`).join(", ")}`);
    lines.push("");
  }

  // Memories section
  const coreMemories = memories.filter((m) => m.tier === "core");
  const activeMemories = memories.filter((m) => m.tier === "active");

  if (coreMemories.length > 0) {
    lines.push("## Core Knowledge (Always Active)");
    lines.push("");
    for (const m of coreMemories) {
      lines.push(`### ${m.title}`);
      lines.push(`_${m.category}_`);
      lines.push("");
      lines.push(m.content);
      lines.push("");
    }
  }

  if (activeMemories.length > 0) {
    lines.push("## Active Memories");
    lines.push("");
    for (const m of activeMemories) {
      lines.push(`- **${m.title}** _(${m.category})_: ${m.content}`);
    }
    lines.push("");
  }

  // Features section
  if (features.length > 0) {
    lines.push("## Features");
    lines.push("");

    const categories = ["core", "ui", "data", "infra", "integration"];
    for (const cat of categories) {
      const catFeatures = features.filter((f) => f.category === cat);
      if (catFeatures.length === 0) continue;

      lines.push(`### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
      lines.push("");
      for (const f of catFeatures) {
        lines.push(`- **${f.name}** (importance: ${f.importance}/10): ${f.description ?? "No description"}`);
        if (f.files.length > 0) {
          lines.push(`  Files: ${f.files.slice(0, 8).join(", ")}${f.files.length > 8 ? ` (+${f.files.length - 8} more)` : ""}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/* ─── Contradiction detection ─── */

/**
 * Checks if a newly created memory contradicts any existing memories.
 * If contradictions are found:
 * 1. Creates 'contradicts' entity_relation between the two memories
 * 2. Adds 'needs_review' tag to both memories
 * 3. Stores contradiction details in the relation metadata
 */
async function detectContradictions(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  memoryId: string,
  projectId: string | null,
  embeddingJson: string,
): Promise<void> {
  // Find top-5 similar memories (excluding self)
  const { data: similar } = await db.rpc("search_memories", {
    p_user_id: userId,
    p_project_id: projectId ?? undefined,
    query_embedding: embeddingJson,
    match_count: 6,
  });

  const candidates = similar
    ?.filter((s) => s.id !== memoryId && s.similarity >= 0.75)
    ?? [];

  if (candidates.length === 0) return;

  // Get the new memory content
  const { data: newMemory } = await db
    .from("memories")
    .select("title, content")
    .eq("id", memoryId)
    .single();
  if (!newMemory) return;

  // Ask GPT-4.1-nano to check for contradictions
  const candidateList = candidates
    .slice(0, 5)
    .map((c, i) => `[${i}] ${c.title}: ${c.content.slice(0, 300)}`)
    .join("\n\n");

  try {
    const { getOpenAI: getAI } = await import("@/lib/openai");
    const response = await getAI().chat.completions.create({
      model: "gpt-4.1-nano",
      max_tokens: 200,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You check if a new memory contradicts any existing ones. " +
            "A contradiction means the new memory asserts something that directly conflicts with an existing memory " +
            "(e.g., different tech choice, opposite pattern, corrected information). " +
            'Respond with JSON: {"contradictions": [{"index": 0, "reason": "brief explanation"}]} ' +
            "or {\"contradictions\": []} if none.",
        },
        {
          role: "user",
          content:
            `NEW MEMORY: ${newMemory.title}\n${newMemory.content}\n\n` +
            `EXISTING MEMORIES:\n${candidateList}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return;

    let result: { contradictions: Array<{ index: number; reason: string }> };
    try {
      result = JSON.parse(text);
    } catch {
      return;
    }

    if (!result.contradictions?.length) return;

    // Process each contradiction
    for (const c of result.contradictions) {
      const candidate = candidates[c.index];
      if (!candidate) continue;

      // Create 'contradicts' entity_relation
      await db
        .from("entity_relations" as never)
        .insert({
          user_id: userId,
          project_id: projectId,
          source_type: "memory",
          source_id: memoryId,
          target_type: "memory",
          target_id: candidate.id,
          relation: "contradicts",
          confidence: candidate.similarity,
          metadata: { reason: c.reason },
        } as never)
        .then(undefined, () => {});

      // Tag both memories with 'needs_review'
      for (const id of [memoryId, candidate.id]) {
        const { data: mem } = await db
          .from("memories")
          .select("tags")
          .eq("id", id)
          .single();
        if (mem && !mem.tags?.includes("needs_review")) {
          await db
            .from("memories")
            .update({ tags: [...(mem.tags ?? []), "needs_review"] })
            .eq("id", id);
        }
      }
    }
  } catch {
    // Non-fatal — contradiction detection is best-effort
  }
}
