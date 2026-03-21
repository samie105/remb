import type { IDEParser, IDEProject, ParsedConversation } from "./types.js";
import {
  detectWorkspaceStorage,
  listWorkspaceProjects,
  queryVscdb,
  queryVscdbLike,
} from "./vscdb-base.js";
import { join } from "node:path";

const APP_NAME = "Windsurf";
const CHAT_KEYS = ["windsurf.chat.history", "codeium"];

export class WindsurfParser implements IDEParser {
  readonly id = "windsurf" as const;
  readonly displayName = "Windsurf (Codeium)";

  async detect(): Promise<boolean> {
    return detectWorkspaceStorage(APP_NAME);
  }

  async listProjects(): Promise<IDEProject[]> {
    return listWorkspaceProjects(APP_NAME);
  }

  async parseConversations(projectId: string): Promise<ParsedConversation[]> {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];

    const dbPath = join(project.storagePath, "state.vscdb");
    const conversations: ParsedConversation[] = [];

    // Try exact key first
    for (const key of CHAT_KEYS) {
      const raw = await queryVscdb(dbPath, key);
      if (raw) {
        try {
          const parsed = parseWindsurfData(JSON.parse(raw));
          conversations.push(...parsed);
        } catch { /* continue to next key */ }
      }
    }

    // Also try pattern match for codeium-related keys
    if (conversations.length === 0) {
      const kvPairs = await queryVscdbLike(dbPath, "%codeium%chat%");
      for (const { value } of kvPairs) {
        try {
          const parsed = parseWindsurfData(JSON.parse(value));
          conversations.push(...parsed);
        } catch { /* skip malformed entries */ }
      }
    }

    return conversations;
  }
}

function parseWindsurfData(data: unknown): ParsedConversation[] {
  if (!data || typeof data !== "object") return [];

  const conversations: ParsedConversation[] = [];
  const d = data as Record<string, unknown>;

  // Windsurf stores data similarly to Cursor — tabs/conversations with messages
  const items = Array.isArray(data)
    ? data
    : Array.isArray(d.tabs)
      ? d.tabs as unknown[]
      : Array.isArray(d.conversations)
        ? d.conversations as unknown[]
        : Array.isArray(d.sessions)
          ? d.sessions as unknown[]
          : [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const chat = item as Record<string, unknown>;

    const rawMessages = Array.isArray(chat.messages)
      ? chat.messages
      : Array.isArray(chat.bubbles)
        ? chat.bubbles
        : Array.isArray(chat.turns)
          ? chat.turns
          : [];

    const messages = rawMessages
      .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object")
      .map((m) => ({
        role: normalizeRole(m.role ?? m.type),
        text: String(m.content ?? m.text ?? m.message ?? "").trim(),
        timestamp: typeof m.timestamp === "number" ? m.timestamp : undefined,
      }))
      .filter((m) => m.text.length > 0);

    if (messages.length === 0) continue;

    conversations.push({
      id: String(chat.id ?? crypto.randomUUID()),
      messages,
      title: typeof chat.title === "string" ? chat.title : messages[0]?.text.slice(0, 100),
    });
  }

  return conversations;
}

function normalizeRole(role: unknown): "user" | "assistant" | "tool" {
  if (typeof role !== "string" && typeof role !== "number") return "user";
  const r = String(role).toLowerCase();
  if (r === "user" || r === "human" || r === "1") return "user";
  if (r === "tool" || r === "function" || r === "system") return "tool";
  return "assistant";
}
