"use server";

import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  summarizeConversation,
  findDuplicateConversation,
  searchConversations,
  type RawConversationEvent,
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
  source?: "mcp" | "cli" | "web" | "api";
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
  source?: "mcp" | "cli" | "web" | "api";
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

  // Generate embedding for the content so it's searchable
  let embedding: number[] | null = null;
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
  // Step 1: AI summarize the raw events
  const { summary, tags, embedding } = await summarizeConversation(
    input.events,
    input.projectSlug ?? undefined,
  );

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
          metadata: (input.metadata ?? {}) as Json,
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

  const { data, error } = await db
    .from("conversation_entries")
    .insert({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      project_slug: input.projectSlug ?? null,
      session_id: input.sessionId,
      type: "conversation" as const,
      content: summary,
      tags,
      metadata: (input.metadata ?? {}) as Json,
      source: input.source ?? "mcp",
      embedding: `[${embedding.join(",")}]`,
      is_summarized: true,
    })
    .select("id, created_at")
    .single();

  if (error) throw new Error(error.message);

  // Auto-trim
  void db.rpc("trim_old_conversations", {
    p_user_id: input.userId,
    keep_count: 1000,
  });

  return { ...data, summary, tags };
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

export async function getConversationHistory(input: GetHistoryInput) {
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

export async function getConversationSessions(userId: string, projectId?: string, limit = 20) {
  const db = createAdminClient();

  let query = db
    .from("conversation_entries")
    .select("session_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
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
      lines.push(`- **${time}** ${icon}${src} ${e.content}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
