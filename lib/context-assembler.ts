"use server";

import { generateEmbedding } from "@/lib/openai";
import { createAdminClient } from "@/lib/supabase/server";
import { getRelatedEntities } from "@/lib/graph-actions";

/* ─── types ─── */

export interface AssembleOptions {
  userId: string;
  projectId?: string;
  query?: string;
  /** Max tokens to fill. Defaults to plan limit or 16000. */
  tokenBudget?: number;
  /** How many semantic recall candidates to fetch. Default 60. */
  recallLimit?: number;
  /** Max hops for graph expansion. Default 1. */
  graphHops?: number;
  /** Whether to include graph-expanded neighbors. Default true. */
  expandGraph?: boolean;
}

export interface ScoredItem {
  id: string;
  kind: "memory" | "context_entry" | "conversation";
  tier?: string;
  category?: string;
  title: string;
  content: string;
  tags?: string[];
  tokenCount: number;
  /** 0-1 composite score */
  score: number;
  /** Individual score components for debugging */
  scoring: {
    semantic: number;
    accessFreq: number;
    recency: number;
    graph: number;
  };
}

export interface AssembleResult {
  items: ScoredItem[];
  totalTokens: number;
  /** Items that exceeded token budget (available for expansion) */
  overflow: number;
}

/* ─── scoring weights ─── */

const WEIGHT_SEMANTIC = 0.40;
const WEIGHT_ACCESS = 0.20;
const WEIGHT_RECENCY = 0.20;
const WEIGHT_GRAPH = 0.20;

/* ─── core assembler ─── */

/**
 * Task-aware context assembly engine.
 *
 * Pipeline:
 * 1. Semantic recall — top-K by cosine similarity to query
 * 2. Graph expansion — 1-hop neighbors of recalled entities
 * 3. Multi-signal scoring — semantic + access + recency + graph centrality
 * 4. Token-budget packing — priority queue, highest score first
 */
export async function assembleContext(opts: AssembleOptions): Promise<AssembleResult> {
  const db = createAdminClient();
  const { userId, projectId, query, graphHops = 1, expandGraph = true } = opts;

  // Resolve token budget
  let budget = opts.tokenBudget;
  if (!budget) {
    const { data: limits } = await db
      .from("plan_limits")
      .select("max_token_budget")
      .eq("plan", "free")
      .single();
    budget = limits?.max_token_budget ?? 16000;
  }

  const recallLimit = opts.recallLimit ?? 60;

  // Step 1: Semantic recall — embed query, fetch top candidates from each table
  let queryEmbedding: number[] | null = null;
  if (query) {
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch { /* fallback: access-only ranking */ }
  }

  const candidates: ScoredItem[] = [];
  const graphConnected = new Set<string>(); // IDs with graph edges

  // 1a. Memories (core + active)
  const memoryCandidates = await fetchMemoryCandidates(
    db, userId, projectId, queryEmbedding, recallLimit,
  );
  candidates.push(...memoryCandidates);

  // 1b. Context entries (if project scoped)
  if (projectId) {
    const contextCandidates = await fetchContextCandidates(
      db, userId, projectId, queryEmbedding, Math.floor(recallLimit * 0.6),
    );
    candidates.push(...contextCandidates);
  }

  // 1c. Recent conversations
  const conversationCandidates = await fetchConversationCandidates(
    db, userId, projectId, queryEmbedding, Math.floor(recallLimit * 0.4),
  );
  candidates.push(...conversationCandidates);

  // Step 2: Graph expansion for top candidates
  if (expandGraph && candidates.length > 0) {
    // Take the top 10 candidates (by semantic score) for graph expansion
    const topBySemantics = [...candidates]
      .sort((a, b) => b.scoring.semantic - a.scoring.semantic)
      .slice(0, 10);

    for (const item of topBySemantics) {
      try {
        const neighbors = await getRelatedEntities(userId, item.kind, item.id, {
          maxHops: graphHops,
          projectId,
        });
        // Mark all neighbor IDs as graph-connected
        for (const n of neighbors) {
          graphConnected.add(n.entity_id);
        }
        // The source item itself benefits from having connections
        graphConnected.add(item.id);
      } catch {
        // Graph queries may fail if tables haven't been migrated — non-fatal
      }
    }
  }

  // Step 3: Compute composite scores
  const now = Date.now();
  const maxAccess = Math.max(1, ...candidates.map((c) => c.scoring.accessFreq));

  for (const item of candidates) {
    // Normalize access frequency to 0-1
    const accessNorm = item.scoring.accessFreq / maxAccess;

    // Recency: exponential decay — half-life of 7 days
    const ageMs = now - item.scoring.recency;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyNorm = Math.exp(-0.1 * ageDays);

    // Graph: binary signal — is the item connected in the graph?
    const graphNorm = graphConnected.has(item.id) ? 1.0 : 0.0;

    // Tier bonus: core = +0.15, active = +0.05
    let tierBonus = 0;
    if (item.tier === "core") tierBonus = 0.15;
    else if (item.tier === "active") tierBonus = 0.05;

    item.scoring.accessFreq = accessNorm;
    item.scoring.recency = recencyNorm;
    item.scoring.graph = graphNorm;

    item.score =
      WEIGHT_SEMANTIC * item.scoring.semantic +
      WEIGHT_ACCESS * accessNorm +
      WEIGHT_RECENCY * recencyNorm +
      WEIGHT_GRAPH * graphNorm +
      tierBonus;
  }

  // Step 4: Pack into token budget — sort by score, fill greedily
  candidates.sort((a, b) => b.score - a.score);

  const packed: ScoredItem[] = [];
  let totalTokens = 0;
  let overflow = 0;

  for (const item of candidates) {
    if (totalTokens + item.tokenCount > budget) {
      overflow++;
      continue;
    }
    packed.push(item);
    totalTokens += item.tokenCount;
  }

  // Touch accessed memories (fire-and-forget)
  const memoryIds = packed.filter((i) => i.kind === "memory").map((i) => i.id);
  if (memoryIds.length > 0) {
    db.rpc("touch_memories", { memory_ids: memoryIds }).then(undefined, () => {});
  }

  return { items: packed, totalTokens, overflow };
}

/* ─── candidate fetchers ─── */

async function fetchMemoryCandidates(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  projectId: string | undefined,
  queryEmbedding: number[] | null,
  limit: number,
): Promise<ScoredItem[]> {
  // If we have a query embedding, use semantic search
  if (queryEmbedding) {
    const { data } = await db.rpc("search_memories", {
      p_user_id: userId,
      p_project_id: projectId ?? undefined,
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: limit,
    });

    return (data ?? []).map((r) => ({
      id: r.id,
      kind: "memory" as const,
      tier: r.tier,
      category: r.category,
      title: r.title,
      content: r.content,
      tags: r.tags,
      tokenCount: r.token_count || Math.ceil(r.content.length / 4),
      score: 0, // computed later
      scoring: {
        semantic: r.similarity,
        accessFreq: r.access_count,
        recency: Date.now(), // no created_at from RPC — use now
        graph: 0,
      },
    }));
  }

  // Fallback: no query — fetch by tier + access count
  let query = db
    .from("memories")
    .select("id, tier, category, title, content, tags, token_count, access_count, created_at")
    .eq("user_id", userId)
    .in("tier", ["core", "active"])
    .order("tier")
    .order("access_count", { ascending: false })
    .limit(limit);

  if (projectId) {
    query = query.or(`project_id.eq.${projectId},project_id.is.null`);
  }

  const { data } = await query;

  return (data ?? []).map((r) => ({
    id: r.id,
    kind: "memory" as const,
    tier: r.tier,
    category: r.category,
    title: r.title,
    content: r.content,
    tags: r.tags,
    tokenCount: r.token_count || Math.ceil(r.content.length / 4),
    score: 0,
    scoring: {
      semantic: 0.5, // neutral score without embedding
      accessFreq: r.access_count,
      recency: new Date(r.created_at).getTime(),
      graph: 0,
    },
  }));
}

async function fetchContextCandidates(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  projectId: string,
  queryEmbedding: number[] | null,
  limit: number,
): Promise<ScoredItem[]> {
  if (queryEmbedding) {
    const { data } = await db.rpc("search_context" as "search_memories", {
      p_user_id: userId,
      p_project_id: projectId,
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_threshold: 0.25,
      match_count: limit,
    } as never);

    return ((data ?? []) as unknown as Array<{
      id: string; content: string;
      token_count: number; similarity: number; created_at: string;
    }>).map((r) => ({
      id: r.id,
      kind: "context_entry" as const,
      title: r.content.slice(0, 80),
      content: r.content,
      tokenCount: r.token_count || Math.ceil(r.content.length / 4),
      score: 0,
      scoring: {
        semantic: r.similarity,
        accessFreq: 0,
        recency: new Date(r.created_at).getTime(),
        graph: 0,
      },
    }));
  }

  // Fallback: fetch newest entries
  const { data: features } = await db
    .from("features")
    .select("id")
    .eq("project_id", projectId);
  const featureIds = (features ?? []).map((f) => f.id);
  if (featureIds.length === 0) return [];

  const { data } = await db
    .from("context_entries")
    .select("id, content, created_at")
    .in("feature_id", featureIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    kind: "context_entry" as const,
    title: r.content.slice(0, 80),
    content: r.content,
    tokenCount: Math.ceil(r.content.length / 4),
    score: 0,
    scoring: {
      semantic: 0.5,
      accessFreq: 0,
      recency: new Date(r.created_at).getTime(),
      graph: 0,
    },
  }));
}

async function fetchConversationCandidates(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  projectId: string | undefined,
  queryEmbedding: number[] | null,
  limit: number,
): Promise<ScoredItem[]> {
  if (queryEmbedding) {
    const { data } = await db.rpc("search_conversations" as "search_memories", {
      p_user_id: userId,
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: limit,
    } as never);

    return ((data ?? []) as unknown as Array<{
      id: string; content: string; session_id: string;
      similarity: number; created_at: string;
    }>).map((r) => ({
      id: r.id,
      kind: "conversation" as const,
      title: `Session ${r.session_id?.slice(0, 8) ?? "unknown"}`,
      content: r.content,
      tokenCount: Math.ceil(r.content.length / 4),
      score: 0,
      scoring: {
        semantic: r.similarity,
        accessFreq: 0,
        recency: new Date(r.created_at).getTime(),
        graph: 0,
      },
    }));
  }

  // Fallback: most recent conversations
  let query = db
    .from("conversation_entries")
    .select("id, content, session_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (projectId) {
    query = query.or(`project_slug.eq.${projectId},project_slug.is.null`);
  }

  const { data } = await query;

  return (data ?? []).map((r) => ({
    id: r.id,
    kind: "conversation" as const,
    title: `Session ${r.session_id?.slice(0, 8) ?? "unknown"}`,
    content: r.content,
    tokenCount: Math.ceil(r.content.length / 4),
    score: 0,
    scoring: {
      semantic: 0.5,
      accessFreq: 0,
      recency: new Date(r.created_at).getTime(),
      graph: 0,
    },
  }));
}
