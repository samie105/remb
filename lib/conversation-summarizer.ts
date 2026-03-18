"use server";

import OpenAI from "openai";
import { generateEmbedding } from "@/lib/openai";
import { createAdminClient } from "@/lib/supabase/server";

/* ─── types ─── */

export interface RawConversationEvent {
  type: "user_message" | "ai_response" | "tool_call" | "file_save" | "chat_turn" | "editor_focus";
  text?: string;
  path?: string;
  name?: string;
  timestamp?: number;
}

export interface SummarizedConversation {
  summary: string;
  tags: string[];
  embedding: number[];
}

/* ─── config ─── */

/** Cheap model for conversation summarization — ~$0.10/1M input tokens */
const SUMMARIZE_MODEL = process.env.OPENAI_CONVERSATION_MODEL ?? "gpt-4.1-nano";

const SUMMARIZE_PROMPT = `You are a concise technical summarizer for an AI coding assistant's memory system.

Given a batch of raw IDE activity events from a coding session, produce:
1. **summary** — A clear, factual 1-3 sentence summary of what was discussed and accomplished. Focus on OUTCOMES (what was built, fixed, decided), not process (what files were opened). Use present tense. Be specific — mention feature names, file names, technologies.
2. **tags** — 2-5 lowercase tags for categorization (e.g. "auth", "bug-fix", "refactor", "ui", "database", "api", "performance").

Rules:
- Ignore editor focus / file open events unless they're the only signal
- Merge related user messages and AI responses into a coherent narrative
- If multiple topics were discussed, mention all of them
- NEVER include raw code snippets in the summary
- NEVER make up work that wasn't in the events
- If the events are trivial (just file opens, no real work), return summary as "Browsing session — no significant changes." with tag "browsing"

Return ONLY valid JSON: { "summary": "...", "tags": ["..."] }`;

/* ─── summarize ─── */

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

/**
 * Takes raw IDE events, summarizes them with a cheap LLM, then generates
 * an embedding for semantic search and dedup.
 */
export async function summarizeConversation(
  events: RawConversationEvent[],
  projectSlug?: string,
): Promise<SummarizedConversation> {
  // Format events into a readable block for the LLM
  const eventText = formatEventsForLLM(events);

  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: SUMMARIZE_MODEL,
    temperature: 0.1,
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SUMMARIZE_PROMPT },
      {
        role: "user",
        content: projectSlug
          ? `Project: ${projectSlug}\n\nEvents:\n${eventText}`
          : `Events:\n${eventText}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content;
  let summary = "Coding session activity.";
  let tags: string[] = [];

  if (text) {
    try {
      const parsed = JSON.parse(text) as { summary?: string; tags?: string[] };
      summary = parsed.summary ?? summary;
      tags = Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase().trim()).slice(0, 8)
        : [];
    } catch { /* use defaults */ }
  }

  // Generate embedding from the summary for search + dedup
  const embedding = await generateEmbedding(summary);

  return { summary, tags, embedding };
}

/**
 * Check if a semantically similar conversation already exists recently.
 * Returns the existing entry ID if a near-duplicate is found (cosine > 0.92).
 */
export async function findDuplicateConversation(
  userId: string,
  projectSlug: string | null,
  embedding: number[],
): Promise<{ id: string; content: string; similarity: number } | null> {
  const db = createAdminClient();

  const { data, error } = await db.rpc("find_duplicate_conversation", {
    p_user_id: userId,
    p_project_slug: projectSlug,
    query_embedding: `[${embedding.join(",")}]`,
    threshold: 0.92,
    lookback_hours: 24,
  });

  if (error || !data || data.length === 0) return null;

  return {
    id: data[0].id,
    content: data[0].content,
    similarity: data[0].similarity,
  };
}

/**
 * Semantic search across conversation history.
 */
export async function searchConversations(
  userId: string,
  query: string,
  opts?: {
    projectSlug?: string;
    tags?: string[];
    limit?: number;
    threshold?: number;
  },
) {
  const embedding = await generateEmbedding(query);
  const db = createAdminClient();

  const { data, error } = await db.rpc("search_conversations", {
    p_user_id: userId,
    query_embedding: `[${embedding.join(",")}]`,
    match_count: opts?.limit ?? 10,
    p_project_slug: opts?.projectSlug ?? null,
    p_tags: opts?.tags ?? null,
    similarity_threshold: opts?.threshold ?? 0.3,
  });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ─── helpers ─── */

function formatEventsForLLM(events: RawConversationEvent[]): string {
  const lines: string[] = [];

  for (const e of events.slice(0, 50)) {
    switch (e.type) {
      case "user_message":
        lines.push(`USER: ${e.text?.slice(0, 300) ?? ""}`);
        break;
      case "ai_response":
        lines.push(`AI: ${e.text?.slice(0, 500) ?? ""}`);
        break;
      case "tool_call":
        lines.push(`TOOL: ${e.name ?? ""} ${e.text?.slice(0, 150) ?? ""}`);
        break;
      case "file_save":
        lines.push(`SAVED: ${e.path ?? ""}`);
        break;
      case "chat_turn":
        lines.push(`CHAT: ${e.text?.slice(0, 300) ?? ""}`);
        break;
      case "editor_focus":
        // Only include if there's nothing else
        if (events.length <= 3) lines.push(`VIEWING: ${e.path ?? ""}`);
        break;
    }
  }

  return lines.join("\n") || "No significant events.";
}
