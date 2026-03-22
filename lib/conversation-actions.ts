"use server";

import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  summarizeConversation,
  findDuplicateConversation,
  searchConversations,
  type RawConversationEvent,
  type ExtractedKnowledge,
  type IDESource,
} from "@/lib/conversation-summarizer";
import { generateEmbedding } from "@/lib/openai";

/* ─── types ─── */

interface LogConversationInput {
  userId: string;
  projectId?: string | null;
  projectSlug?: string | null;
  featureId?: string | null;
  sessionId: string;
  type?: "summary" | "tool_call" | "milestone" | "conversation";
  content: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  source?: "mcp" | "cli" | "web" | "web-internal" | "api";
  /** Skip embedding generation and dedup check (for raw chat messages) */
  skipEmbedding?: boolean;
}

/**
 * Smart conversation logging with raw IDE events.
 * Events are AI-summarized, embedded, and dedup-checked before storage.
 */
interface LogSmartConversationInput {
  userId: string;
  projectId?: string | null;
  projectSlug?: string | null;
  sessionId: string;
  events: RawConversationEvent[];
  metadata?: Record<string, unknown>;
  source?: "mcp" | "cli" | "web" | "web-internal" | "api" | "import";
  ideSource?: IDESource;
}

interface GetHistoryInput {
  userId: string;
  projectId?: string | null;
  projectSlug?: string | null;
  startDate?: string;
  endDate?: string;
  limit?: number;
  sessionId?: string;
}

interface SearchConversationInput {
  userId: string;
  query: string;
  projectSlug?: string | null;
  tags?: string[];
  limit?: number;
  threshold?: number;
}

/* ─── log a conversation entry (basic — pre-formatted content) ─── */

/** Hard cap: 32 KB per conversation entry (matches DB constraint) */
const MAX_CONVERSATION_BYTES = 32_768;

export async function logConversation(input: LogConversationInput) {
  const db = createAdminClient();

  // Enforce content size limit
  const contentBytes = new TextEncoder().encode(input.content).length;
  const trimmedContent = contentBytes > MAX_CONVERSATION_BYTES
    ? input.content.slice(0, MAX_CONVERSATION_BYTES - 20) + "\n... (trimmed)"
    : input.content;

  // Generate embedding for the content so it's searchable (skip for raw chat messages)
  let embedding: number[] | null = null;
  if (!input.skipEmbedding) {
    try {
      embedding = await generateEmbedding(trimmedContent.slice(0, 8000));
    } catch { /* non-fatal — entry still saved without embedding */ }

    // Dedup check: if very similar entry exists recently, update it instead
    if (embedding && input.projectSlug) {
      const dup = await findDuplicateConversation(
        input.userId,
        input.projectSlug,
        embedding,
      );
      if (dup) {
        // Merge — append new content to existing entry
        const merged = `${dup.content}\n---\n${trimmedContent}`;
        const mergedTrimmed = new TextEncoder().encode(merged).length > MAX_CONVERSATION_BYTES
          ? merged.slice(0, MAX_CONVERSATION_BYTES - 20) + "\n... (trimmed)"
          : merged;

        const { data, error } = await db
          .from("conversation_entries")
          .update({
            content: mergedTrimmed,
            tags: input.tags ?? [],
            metadata: (input.metadata ?? {}) as Json,
            embedding: `[${embedding.join(",")}]`,
          })
          .eq("id", dup.id)
          .select("id, created_at")
          .single();

        if (!error && data) return { ...data, deduplicated: true };
      }
    }
  }

  const insertData = {
    user_id: input.userId,
    project_id: input.projectId ?? null,
    project_slug: input.projectSlug ?? null,
    feature_id: input.featureId ?? null,
    session_id: input.sessionId,
    type: input.type ?? "summary",
    content: trimmedContent,
    tags: input.tags ?? [],
    metadata: (input.metadata ?? {}) as Json,
    source: input.source ?? "mcp",
    ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
  };

  const { data, error } = await db
    .from("conversation_entries")
    .insert(insertData)
    .select("id, created_at")
    .single();

  if (error) throw new Error(error.message);

  // Auto-trim: keep conversations bounded per user (fire-and-forget)
  void db.rpc("trim_old_conversations", {
    p_user_id: input.userId,
    keep_count: 1000,
  });

  return data;
}

/* ─── log smart conversation (raw events → AI summarize → embed → dedup → store) ─── */

export async function logSmartConversation(input: LogSmartConversationInput) {
  // Step 1: AI summarize the raw events (now with knowledge extraction)
  const { title, summary, tags, embedding, extractedKnowledge, referencedFeatures, referencedFiles } = await summarizeConversation(
    input.events,
    input.projectSlug ?? undefined,
  );

  // Extract file paths from file_save events for cross-referencing
  const filesChanged = [
    ...new Set(
      input.events
        .filter((e) => e.type === "file_save" && e.path)
        .map((e) => e.path!),
    ),
  ];

  // Merge files_changed + referenced data into metadata (include title for display)
  const metadata = {
    ...(input.metadata ?? {}),
    ...(title ? { title } : {}),
    ...(filesChanged.length > 0 ? { files_changed: filesChanged } : {}),
    ...(referencedFeatures.length > 0 ? { referenced_features: referencedFeatures } : {}),
    ...(referencedFiles.length > 0 ? { referenced_files: referencedFiles } : {}),
    ...(extractedKnowledge.length > 0 ? { extracted_knowledge: extractedKnowledge } : {}),
  };

  // Step 2: Dedup check
  if (input.projectSlug) {
    const dup = await findDuplicateConversation(
      input.userId,
      input.projectSlug,
      embedding,
    );
    if (dup) {
      // Similar entry exists — merge the new summary into the existing one
      const db = createAdminClient();
      const merged = `${dup.content}\n• ${summary}`;
      const mergedTrimmed = new TextEncoder().encode(merged).length > MAX_CONVERSATION_BYTES
        ? merged.slice(0, MAX_CONVERSATION_BYTES - 20) + "\n... (trimmed)"
        : merged;

      // Re-embed the merged content
      let mergedEmbedding: number[];
      try {
        mergedEmbedding = await generateEmbedding(mergedTrimmed.slice(0, 8000));
      } catch {
        mergedEmbedding = embedding;
      }

      const { data, error } = await db
        .from("conversation_entries")
        .update({
          content: mergedTrimmed,
          tags: [...new Set([...(tags ?? []), ...(dup.content.match(/tags/) ? [] : tags)])],
          embedding: `[${mergedEmbedding.join(",")}]`,
          metadata: metadata as Json,
          is_summarized: true,
        })
        .eq("id", dup.id)
        .select("id, created_at")
        .single();

      if (!error && data) return { ...data, deduplicated: true, summary };
    }
  }

  // Step 3: Insert new entry
  const db = createAdminClient();

  // Thread assignment: find an existing thread or create a new one
  let threadId: string | null = null;
  try {
    const { data: existingThread } = await db.rpc("find_conversation_thread" as never, {
      p_user_id: input.userId,
      p_project_id: input.projectId ?? null,
      query_embedding: `[${embedding.join(",")}]`,
    } as never);
    threadId = (existingThread as string | null) ?? null;
  } catch {
    /* thread assignment is non-fatal — will fall-through to new thread */
  }

  // Generate new thread_id if no existing thread matched
  const entryId = crypto.randomUUID();
  if (!threadId) threadId = entryId;

  const { data, error } = await db
    .from("conversation_entries")
    .insert({
      id: entryId,
      user_id: input.userId,
      project_id: input.projectId ?? null,
      project_slug: input.projectSlug ?? null,
      session_id: input.sessionId,
      thread_id: threadId,
      type: "conversation" as const,
      content: summary,
      tags,
      metadata: metadata as Json,
      source: input.source ?? "mcp",
      ...(input.ideSource ? { ide_source: input.ideSource } : {}),
      embedding: `[${embedding.join(",")}]`,
      is_summarized: true,
    } as never)
    .select("id, created_at")
    .single();

  if (error) throw new Error(error.message);

  // Auto-trim
  void db.rpc("trim_old_conversations", {
    p_user_id: input.userId,
    keep_count: 1000,
  });

  // Step 4: Auto-create memories from high-confidence extractions (fire-and-forget)
  if (extractedKnowledge.length > 0 && data?.id) {
    void autoCreateMemoriesFromKnowledge(
      db, input.userId, input.projectId ?? null,
      data.id, extractedKnowledge,
    ).catch(() => {});
  }

  return { ...data, title, summary, tags };
}

/* ─── search conversations semantically ─── */

export async function searchConversationHistory(input: SearchConversationInput) {
  return searchConversations(input.userId, input.query, {
    projectSlug: input.projectSlug ?? undefined,
    tags: input.tags,
    limit: input.limit,
    threshold: input.threshold,
  });
}

/* ─── query conversation history ─── */

export async function getConversationHistory(input: GetHistoryInput & { source?: string }) {
  const db = createAdminClient();
  const limit = Math.min(input.limit ?? 50, 200);

  let query = db
    .from("conversation_entries")
    .select("id, project_id, project_slug, session_id, type, content, tags, metadata, source, created_at, is_summarized")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.projectId) {
    query = query.eq("project_id", input.projectId);
  }
  if (input.projectSlug) {
    query = query.eq("project_slug", input.projectSlug);
  }
  if (input.sessionId) {
    query = query.eq("session_id", input.sessionId);
  }
  if (input.source) {
    query = query.eq("source", input.source);
  }
  if (input.startDate) {
    query = query.gte("created_at", input.startDate);
  }
  if (input.endDate) {
    query = query.lte("created_at", input.endDate);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ─── list distinct sessions ─── */

export async function getConversationSessions(userId: string, projectId?: string, limit = 20, source?: string) {
  const db = createAdminClient();

  let query = db
    .from("conversation_entries")
    .select("session_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  if (source) {
    query = query.eq("source", source);
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);

  // Group by session_id, pick first/last timestamps
  const sessions = new Map<string, { first: string; last: string; count: number }>();
  for (const row of data ?? []) {
    const existing = sessions.get(row.session_id);
    if (!existing) {
      sessions.set(row.session_id, { first: row.created_at, last: row.created_at, count: 1 });
    } else {
      if (row.created_at < existing.first) existing.first = row.created_at;
      if (row.created_at > existing.last) existing.last = row.created_at;
      existing.count++;
    }
  }

  return Array.from(sessions.entries())
    .map(([sessionId, info]) => ({ sessionId, ...info }))
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, limit);
}

/* ─── get thread history ─── */

export async function getThreadHistory(userId: string, threadId: string, maxEntries = 50) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("get_thread_entries" as never, {
    p_user_id: userId,
    p_thread_id: threadId,
    max_entries: Math.min(maxEntries, 100),
  } as never);

  if (error) throw new Error(error.message);
  return (data as Array<{
    id: string;
    session_id: string;
    type: string;
    content: string;
    tags: string[];
    metadata: Record<string, unknown>;
    source: string;
    created_at: string;
  }>) ?? [];
}

/* ─── generate markdown from entries ─── */

export async function generateConversationMarkdown(input: GetHistoryInput) {
  const entries = await getConversationHistory(input);
  if (entries.length === 0) return "No conversation history found.";

  // Entries come newest-first; reverse for chronological output
  const chronological = [...entries].reverse();

  // Group by date
  const grouped = new Map<string, typeof chronological>();
  for (const entry of chronological) {
    const date = entry.created_at.slice(0, 10);
    const list = grouped.get(date) ?? [];
    list.push(entry);
    grouped.set(date, list);
  }

  const lines: string[] = ["# Conversation History", ""];

  for (const [date, dayEntries] of grouped) {
    lines.push(`## ${date}`, "");
    for (const e of dayEntries) {
      const time = e.created_at.slice(11, 16);
      const icon = e.type === "tool_call" ? "🔧" : e.type === "milestone" ? "🏁" : "💬";
      const src = e.source !== "mcp" ? ` [${e.source}]` : "";
      // Use metadata title if available, otherwise extract first sentence
      const meta = e.metadata as Record<string, unknown> | null;
      const metaTitle = typeof meta?.title === "string" ? meta.title : null;
      const title = metaTitle ?? (() => {
        const clean = e.content
          .replace(/```[\s\S]*?```/g, "")
          .replace(/\n+/g, " ")
          .trim();
        const first = clean.split(/[.!?]\s/)[0];
        return first.length > 200
          ? first.slice(0, 200) + "..."
          : first + (first.endsWith(".") ? "" : ".");
      })();
      lines.push(`- **${time}** ${icon}${src} ${title}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/* ─── auto-create memories from extracted knowledge ─── */

/**
 * Creates memories from high-confidence knowledge extracted during conversation summarization.
 * For each extraction:
 * 1. Check for duplicate memory via embedding similarity (cosine > 0.88)
 * 2. If duplicate: just touch the existing memory (bump access count)
 * 3. If new: create as active-tier memory with category matching the knowledge type
 * 4. Create entity_relation linking the conversation to the new memory
 */
async function autoCreateMemoriesFromKnowledge(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  projectId: string | null,
  conversationEntryId: string,
  knowledge: ExtractedKnowledge[],
) {
  // Check quota before creating — if over limit, skip entirely
  const { data: withinQuota } = await db.rpc("check_memory_quota", { p_user_id: userId });
  if (withinQuota === false) return;

  const categoryMap: Record<string, string> = {
    decision: "decision",
    pattern: "pattern",
    correction: "correction",
    gotcha: "knowledge",
    preference: "preference",
  };

  for (const item of knowledge) {
    if (item.confidence < 0.85) continue;

    // Generate embedding for duplicate check
    let itemEmbedding: number[];
    try {
      itemEmbedding = await generateEmbedding(item.content);
    } catch {
      continue; // Can't check duplication without embedding
    }

    // Search for similar existing memories
    const { data: similar } = await db.rpc("search_memories", {
      p_user_id: userId,
      p_project_id: projectId ?? undefined,
      query_embedding: `[${itemEmbedding.join(",")}]`,
      match_count: 3,
    });

    const existing = similar?.filter((s) => s.similarity >= 0.88)?.[0];

    if (existing) {
      // Duplicate — just bump access count
      await db.rpc("touch_memories", { memory_ids: [existing.id] });
      continue;
    }

    // New knowledge — create memory
    const title = item.content.length > 80
      ? item.content.slice(0, 77) + "..."
      : item.content;

    const { data: newMemory } = await db
      .from("memories")
      .insert({
        user_id: userId,
        project_id: projectId,
        tier: "active" as const,
        category: (categoryMap[item.type] ?? "general") as "general",
        title,
        content: item.content,
        tags: [item.type, "auto-extracted"],
        token_count: Math.ceil(item.content.length / 4),
        embedding: `[${itemEmbedding.join(",")}]`,
      })
      .select("id")
      .single();

    // Link conversation → memory via entity_relations
    if (newMemory?.id) {
      await db
        .from("entity_relations" as never)
        .insert({
          user_id: userId,
          project_id: projectId,
          source_type: "conversation",
          source_id: conversationEntryId,
          target_type: "memory",
          target_id: newMemory.id,
          relation: "derived_from",
          confidence: item.confidence,
          metadata: { extraction_type: item.type },
        } as never)
        .then(undefined, () => { /* non-fatal if entity_relations not migrated yet */ });
    }
  }
}
