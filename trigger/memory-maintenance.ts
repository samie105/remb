import { task, logger, schedules } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase/server";
import { generateEmbedding, getOpenAI } from "@/lib/openai";

/* ─── Payload Types ─── */

export interface MemoryMaintenancePayload {
  /** Optional: limit to a single user */
  userId?: string;
  /** Which operations to run (default: all) */
  operations?: ("archive" | "consolidate" | "compress" | "synthesize")[];
}

/* ─── Configuration ─── */

const STALE_DAYS = 60; // Archive active memories not accessed in 60 days
const CONSOLIDATION_SIMILARITY = 0.88; // Cosine threshold for merge candidates
const SYNTHESIS_SIMILARITY_MIN = 0.70; // Related but distinct
const SYNTHESIS_SIMILARITY_MAX = 0.87; // Below consolidation threshold
const SYNTHESIS_MIN_CLUSTER = 3; // Minimum memories to form a cluster
const MAX_USERS_PER_RUN = 50;
const BATCH_SIZE = 100;

/* ─── Main Task ─── */

/**
 * Memory maintenance task. Runs scheduled or on-demand.
 * Operations:
 * 1. archive  — Move stale active memories to archive tier
 * 2. compress — Generate AI-compressed content for archived memories without it
 * 3. consolidate — Find and merge highly-similar memory pairs
 */
export const memoryMaintenanceTask = task({
  id: "memory-maintenance",
  maxDuration: 300, // 5 min
  machine: "small-2x",
  retry: { maxAttempts: 1 },

  run: async (payload: MemoryMaintenancePayload) => {
    const db = createAdminClient();
    const ops = payload.operations ?? ["archive", "compress", "consolidate"];
    const stats = { archived: 0, compressed: 0, consolidated: 0, synthesized: 0, errors: 0 };

    // Get users to process
    let userIds: string[];
    if (payload.userId) {
      userIds = [payload.userId];
    } else {
      const { data } = await db
        .from("memories")
        .select("user_id")
        .eq("tier", "active")
        .limit(MAX_USERS_PER_RUN);
      userIds = [...new Set((data ?? []).map((r) => r.user_id))];
    }

    for (const userId of userIds) {
      try {
        if (ops.includes("archive")) {
          stats.archived += await archiveStaleMemories(db, userId);
        }
        if (ops.includes("compress")) {
          stats.compressed += await compressArchivedMemories(db, userId);
        }
        if (ops.includes("consolidate")) {
          stats.consolidated += await consolidateSimilarMemories(db, userId);
        }
        if (ops.includes("synthesize")) {
          stats.synthesized += await synthesizeMemoryClusters(db, userId);
        }
      } catch (err) {
        stats.errors++;
        logger.error(`Maintenance failed for user ${userId}`, { error: String(err) });
      }
    }

    logger.info("Memory maintenance complete", stats);
    return stats;
  },
});

/* ─── Scheduled wrapper (daily at 3am UTC) ─── */

export const dailyMemoryMaintenance = schedules.task({
  id: "daily-memory-maintenance",
  maxDuration: 300,
  machine: "small-2x",
  run: async () => {
    // Just run the full maintenance with all operations
    return memoryMaintenanceTask.trigger({ operations: ["archive", "compress"] });
  },
});

export const weeklyMemoryConsolidation = schedules.task({
  id: "weekly-memory-consolidation",
  maxDuration: 300,
  machine: "small-2x",
  run: async () => {
    return memoryMaintenanceTask.trigger({ operations: ["consolidate", "synthesize"] });
  },
});

/* ─── Operation: Archive stale memories ─── */

async function archiveStaleMemories(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: stale } = await db
    .from("memories")
    .select("id, title, content")
    .eq("user_id", userId)
    .eq("tier", "active")
    .lt("last_accessed_at", cutoff)
    .limit(BATCH_SIZE);

  if (!stale?.length) return 0;

  // Generate compressed content for each before archiving
  const updates = await Promise.all(
    stale.map(async (m) => {
      let compressed: string | null = null;
      try {
        compressed = await aiCompress(m.title, m.content);
      } catch {
        // Fallback: no compression, still archive
      }
      return { id: m.id, compressed };
    }),
  );

  let count = 0;
  for (const u of updates) {
    const { error } = await db
      .from("memories")
      .update({
        tier: "archive",
        ...(u.compressed ? { compressed_content: u.compressed } : {}),
      })
      .eq("id", u.id)
      .eq("user_id", userId);

    if (!error) count++;
  }

  logger.info(`Archived ${count} stale memories for ${userId}`);
  return count;
}

/* ─── Operation: Compress archived memories without compressed_content ─── */

async function compressArchivedMemories(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<number> {
  const { data: uncompressed } = await db
    .from("memories")
    .select("id, title, content")
    .eq("user_id", userId)
    .eq("tier", "archive")
    .is("compressed_content", null)
    .limit(BATCH_SIZE);

  if (!uncompressed?.length) return 0;

  let count = 0;
  for (const m of uncompressed) {
    try {
      const compressed = await aiCompress(m.title, m.content);
      const { error } = await db
        .from("memories")
        .update({ compressed_content: compressed })
        .eq("id", m.id);
      if (!error) count++;
    } catch {
      // Skip this one
    }
    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 100));
  }

  logger.info(`Compressed ${count} archived memories for ${userId}`);
  return count;
}

/* ─── Operation: Consolidate similar memories ─── */

async function consolidateSimilarMemories(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<number> {
  // Get active memories with embeddings
  const { data: memories } = await db
    .from("memories")
    .select("id, title, content, embedding, tier, token_count, tags, category")
    .eq("user_id", userId)
    .in("tier", ["core", "active"])
    .not("embedding", "is", null)
    .order("created_at", { ascending: false })
    .limit(BATCH_SIZE);

  if (!memories || memories.length < 2) return 0;

  const merged = new Set<string>();
  let count = 0;

  for (const m of memories) {
    if (merged.has(m.id)) continue;

    // Find similar memories via RPC
    const { data: similar } = await db.rpc("search_memories", {
      p_user_id: userId,
      query_embedding: m.embedding!,
      match_count: 5,
    });

    const candidates = similar
      ?.filter((s) => s.id !== m.id && !merged.has(s.id) && s.similarity >= CONSOLIDATION_SIMILARITY)
      ?? [];

    if (candidates.length === 0) continue;

    // Merge top candidate with AI
    const candidate = candidates[0];
    try {
      const mergedContent = await aiMerge(m.title, m.content, candidate.title, candidate.content);
      if (!mergedContent) continue;

      // Update the primary memory with merged content
      const mergedEmbedding = await generateEmbedding(mergedContent.slice(0, 8000));
      await db
        .from("memories")
        .update({
          content: mergedContent,
          title: mergedContent.length > 80 ? mergedContent.slice(0, 77) + "..." : m.title,
          embedding: `[${mergedEmbedding.join(",")}]`,
          token_count: Math.ceil(mergedContent.length / 4),
          tags: [...new Set([...(m.tags ?? []), "consolidated"])],
        })
        .eq("id", m.id);

      // Archive the absorbed memory
      await db
        .from("memories")
        .update({ tier: "archive", compressed_content: `Consolidated into memory ${m.id}` })
        .eq("id", candidate.id);

      merged.add(candidate.id);
      count++;
    } catch {
      // Skip this pair
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  logger.info(`Consolidated ${count} memory pairs for ${userId}`);
  return count;
}

/* ─── Operation: Synthesize related memory clusters ─── */

async function synthesizeMemoryClusters(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<number> {
  // Find clusters of related-but-distinct memories via SQL (RPC not in generated types yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (db as any).rpc("find_memory_clusters", {
    p_user_id: userId,
    p_similarity_min: SYNTHESIS_SIMILARITY_MIN,
    p_similarity_max: SYNTHESIS_SIMILARITY_MAX,
    p_min_cluster_size: SYNTHESIS_MIN_CLUSTER,
    p_max_clusters: 10,
  }) as { data: Array<{ cluster_id: number; memory_id: string; title: string; content: string; category: string; tier: string; similarity_to_centroid: number }> | null; error: any };

  if (error || !rows?.length) return 0;

  // Group rows by cluster_id
  const clusters = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = clusters.get(row.cluster_id) ?? [];
    list.push(row);
    clusters.set(row.cluster_id, list);
  }

  let count = 0;

  for (const [clusterId, members] of clusters) {
    if (members.length < SYNTHESIS_MIN_CLUSTER) continue;

    try {
      // Check if we already have a synthesis for this cluster
      const memberIds = members.map((m) => m.memory_id);
      const { data: existing } = await db
        .from("memories")
        .select("id")
        .eq("user_id", userId)
        .contains("tags", ["synthesized"])
        .limit(1);

      // Build the synthesis prompt
      const memoryTexts = members
        .map((m, i) => `[${i + 1}] ${m.title}:\n${m.content}`)
        .join("\n\n");

      const synthesis = await aiSynthesize(memoryTexts, members.length);
      if (!synthesis) continue;

      // Generate embedding for the synthesis
      const embedding = await generateEmbedding(synthesis.content.slice(0, 8000));

      // Check for duplicate synthesis (don't create if very similar to existing)
      const { data: dupes } = await db.rpc("search_memories", {
        p_user_id: userId,
        query_embedding: `[${embedding.join(",")}]`,
        match_count: 1,
      });

      if ((dupes?.[0]?.similarity ?? 0) >= 0.92) {
        logger.info(`Skipping cluster ${clusterId} — synthesis already exists`);
        continue;
      }

      // Create the synthesis memory
      const { data: newMemory } = await db
        .from("memories")
        .insert({
          user_id: userId,
          tier: "core",
          category: "knowledge",
          title: synthesis.title,
          content: synthesis.content,
          embedding: `[${embedding.join(",")}]`,
          token_count: Math.ceil(synthesis.content.length / 4),
          tags: ["synthesized", "auto-generated"],
        })
        .select("id")
        .single();

      if (!newMemory) continue;

      // Link synthesis to source memories via entity_relations (table not in generated types yet)
      const relations = memberIds.map((sourceId) => ({
        user_id: userId,
        source_entity: `memory:${sourceId}`,
        target_entity: `memory:${newMemory.id}`,
        relation_type: "synthesized_into",
        confidence: 0.9,
        source: "memory-maintenance",
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("entity_relations").insert(relations);

      count++;
      logger.info(`Synthesized cluster ${clusterId} (${members.length} memories) → ${newMemory.id}`);
    } catch (err) {
      logger.error(`Synthesis failed for cluster ${clusterId}`, { error: String(err) });
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  logger.info(`Synthesized ${count} memory clusters for ${userId}`);
  return count;
}

/* ─── AI helpers ─── */

async function aiCompress(title: string, content: string): Promise<string> {
  if (content.length < 200) return content;

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
          "Remove redundancy and filler. Target ~30% of original length. Output ONLY the compressed text.",
      },
      { role: "user", content: `Title: ${title}\n\n${content}` },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? content;
}

async function aiMerge(
  titleA: string, contentA: string,
  titleB: string, contentB: string
): Promise<string | null> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4.1-nano",
    max_tokens: 500,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Merge these two related memories into a single, comprehensive entry. " +
          "Preserve all unique information from both. Remove duplication. " +
          "Output ONLY the merged content.",
      },
      {
        role: "user",
        content:
          `Memory A — ${titleA}:\n${contentA}\n\n` +
          `Memory B — ${titleB}:\n${contentB}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? null;
}

async function aiSynthesize(
  memoryTexts: string,
  count: number,
): Promise<{ title: string; content: string } | null> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4.1-nano",
    max_tokens: 600,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          `You are synthesizing ${count} related memories into a single composite understanding. ` +
          "These memories cover different aspects of the same topic. " +
          "Create a unified, comprehensive knowledge entry that captures the full picture. " +
          "Include key patterns, decisions, and relationships between the memories. " +
          "Output JSON: {\"title\": \"...\", \"content\": \"...\"}",
      },
      { role: "user", content: memoryTexts },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { title?: string; content?: string };
    if (!parsed.title || !parsed.content) return null;
    return { title: parsed.title, content: parsed.content };
  } catch {
    return null;
  }
}
