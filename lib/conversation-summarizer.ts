"use server";

import OpenAI from "openai";
import { generateEmbedding } from "@/lib/openai";
import { createAdminClient } from "@/lib/supabase/server";

/* ─── types ─── */

export type IDESource =
  | "cursor"
  | "claude-code"
  | "vscode"
  | "windsurf"
  | "intellij"
  | "pycharm"
  | "android-studio"
  | "visual-studio"
  | "zed"
  | "sublime-text";

export interface RawConversationEvent {
  type: "user_message" | "ai_response" | "tool_call" | "file_save" | "chat_turn" | "editor_focus";
  text?: string;
  path?: string;
  name?: string;
  timestamp?: number;
}

export interface ExtractedKnowledge {
  type: "decision" | "pattern" | "correction" | "gotcha" | "preference";
  content: string;
  confidence: number;
}

export interface SummarizedConversation {
  title: string;
  summary: string;
  tags: string[];
  embedding: number[];
  /** Structured knowledge extracted from the conversation */
  extractedKnowledge: ExtractedKnowledge[];
  /** Feature names referenced in the conversation */
  referencedFeatures: string[];
  /** File paths referenced in the conversation */
  referencedFiles: string[];
}

/* ─── config ─── */

/** Cheap model for conversation summarization — ~$0.10/1M input tokens */
const SUMMARIZE_MODEL = process.env.OPENAI_CONVERSATION_MODEL ?? "gpt-4.1-nano";

const SUMMARIZE_PROMPT = `You are a concise technical summarizer for an AI coding assistant's memory system.

Given a batch of raw IDE activity events from a coding session, produce:
1. **title** — A short, descriptive title (5-10 words max) that captures the main activity. Use action verbs. Examples: "Add delete button to conversation list", "Fix mermaid diagram parse errors", "Refactor auth middleware for SSR". NEVER start with "The session involves" or "The session focuses on".
2. **summary** — A clear, factual 1-3 sentence summary of what was discussed and accomplished. Focus on OUTCOMES (what was built, fixed, decided), not process (what files were opened). Use present tense. Be specific — mention feature names, file names, technologies.
3. **tags** — 2-5 lowercase tags for categorization (e.g. "auth", "bug-fix", "refactor", "ui", "database", "api", "performance").
4. **extracted_knowledge** — Array of actionable learnings from this session. Each entry has:
   - "type": one of "decision" (architectural choice), "pattern" (reusable approach), "correction" (mistake to avoid), "gotcha" (surprising behavior), "preference" (user's coding style preference)
   - "content": the actual knowledge, written as a standalone fact (1-2 sentences)
   - "confidence": 0.0-1.0 how confident you are this is a real, reusable insight (not just session noise)
   Only include entries with confidence >= 0.7. If no clear knowledge, return empty array.
5. **referenced_features** — Feature/module names mentioned (e.g. "Auth Service", "Payment API"). Empty array if none.
6. **referenced_files** — File paths mentioned (e.g. "lib/auth.ts"). Empty array if none.

Rules:
- Ignore editor focus / file open events unless they're the only signal
- Merge related user messages and AI responses into a coherent narrative
- If multiple topics were discussed, mention all of them
- NEVER include raw code snippets in the summary
- NEVER make up work that wasn't in the events
- If the events are trivial (just file opens, no real work), return title as "Browsing session", summary as "Browsing session — no significant changes." with tag "browsing" and no extracted knowledge
- For extracted_knowledge: only extract genuinely reusable insights, not obvious facts

Return ONLY valid JSON: { "title": "...", "summary": "...", "tags": ["..."], "extracted_knowledge": [...], "referenced_features": [...], "referenced_files": [...] }`;

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
    max_tokens: 600,
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
  let title = "Coding session";
  let summary = "Coding session activity.";
  let tags: string[] = [];
  let extractedKnowledge: ExtractedKnowledge[] = [];
  let referencedFeatures: string[] = [];
  let referencedFiles: string[] = [];

  if (text) {
    try {
      const parsed = JSON.parse(text) as {
        title?: string;
        summary?: string;
        tags?: string[];
        extracted_knowledge?: Array<{ type?: string; content?: string; confidence?: number }>;
        referenced_features?: string[];
        referenced_files?: string[];
      };
      title = parsed.title ?? title;
      summary = parsed.summary ?? summary;
      tags = Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase().trim()).slice(0, 8)
        : [];
      extractedKnowledge = Array.isArray(parsed.extracted_knowledge)
        ? parsed.extracted_knowledge
            .filter((k) => k.content && k.type && (k.confidence ?? 0) >= 0.7)
            .map((k) => ({
              type: k.type as ExtractedKnowledge["type"],
              content: k.content!,
              confidence: k.confidence ?? 0.8,
            }))
            .slice(0, 10)
        : [];
      referencedFeatures = Array.isArray(parsed.referenced_features)
        ? parsed.referenced_features.filter((f): f is string => typeof f === "string").slice(0, 10)
        : [];
      referencedFiles = Array.isArray(parsed.referenced_files)
        ? parsed.referenced_files.filter((f): f is string => typeof f === "string").slice(0, 20)
        : [];
    } catch { /* use defaults */ }
  }

  // Generate embedding from the summary for search + dedup
  const embedding = await generateEmbedding(summary);

  return { title, summary, tags, embedding, extractedKnowledge, referencedFeatures, referencedFiles };
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
