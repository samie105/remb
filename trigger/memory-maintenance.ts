import { task, logger, schedules } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase/server";
import { generateEmbedding, getOpenAI } from "@/lib/openai";

/* ─── Payload Types ─── */

export interface MemoryMaintenancePayload {
  /** Optional: limit to a single user */
  userId?: string;
  /** Which operations to run (default: all) */
  operations?: ("archive" | "consolidate" | "compress")[];
}

/* ─── Configuration ─── */

const STALE_DAYS = 60; // Archive active memories not accessed in 60 days
const CONSOLIDATION_SIMILARITY = 0.88; // Cosine threshold for merge candidates
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
    const stats = { archived: 0, compressed: 0, consolidated: 0, errors: 0 };

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
    return memoryMaintenanceTask.trigger({ operations: ["consolidate"] });
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
