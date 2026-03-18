"use server";

import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

/* ─── types ─── */

interface LogConversationInput {
  userId: string;
  projectId?: string | null;
  sessionId: string;
  type?: "summary" | "tool_call" | "milestone";
  content: string;
  metadata?: Record<string, unknown>;
  source?: "mcp" | "cli" | "web" | "api";
}

interface GetHistoryInput {
  userId: string;
  projectId?: string | null;
  startDate?: string;
  endDate?: string;
  limit?: number;
  sessionId?: string;
}

/* ─── log a conversation entry ─── */

/** Hard cap: 32 KB per conversation entry (matches DB constraint) */
const MAX_CONVERSATION_BYTES = 32_768;

export async function logConversation(input: LogConversationInput) {
  const db = createAdminClient();

  // Enforce content size limit
  const contentBytes = new TextEncoder().encode(input.content).length;
  const trimmedContent = contentBytes > MAX_CONVERSATION_BYTES
    ? input.content.slice(0, MAX_CONVERSATION_BYTES - 20) + "\n... (trimmed)"
    : input.content;

  const { data, error } = await db
    .from("conversation_entries")
    .insert({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      session_id: input.sessionId,
      type: input.type ?? "summary",
      content: trimmedContent,
      metadata: (input.metadata ?? {}) as Json,
      source: input.source ?? "mcp",
    })
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

/* ─── query conversation history ─── */

export async function getConversationHistory(input: GetHistoryInput) {
  const db = createAdminClient();
  const limit = Math.min(input.limit ?? 50, 200);

  let query = db
    .from("conversation_entries")
    .select("id, project_id, session_id, type, content, metadata, source, created_at")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.projectId) {
    query = query.eq("project_id", input.projectId);
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
