import type { IDEParser, IDEProject, ParsedConversation } from "./types.js";
import {
  detectWorkspaceStorage,
  listWorkspaceProjects,
  queryVscdb,
} from "./vscdb-base.js";
import { join } from "node:path";

const APP_NAME = "Cursor";
const CHAT_KEY = "workbench.panel.aichat.view.aichat.chatdata";

export class CursorParser implements IDEParser {
  readonly id = "cursor" as const;
  readonly displayName = "Cursor";

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
    const raw = await queryVscdb(dbPath, CHAT_KEY);
    if (!raw) return [];

    try {
      const chatData = JSON.parse(raw);
      return parseCursorChatData(chatData);
    } catch {
      return [];
    }
  }
}

/**
 * Cursor stores chat data as a JSON object with tabs/conversations.
 * Structure: { tabs: [{ id, title, bubbles: [{ type, text, ... }] }] }
 */
function parseCursorChatData(data: unknown): ParsedConversation[] {
  if (!data || typeof data !== "object") return [];

  const conversations: ParsedConversation[] = [];

  // Cursor can store data as { tabs: [...] } or as an array directly
  const tabs = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>).tabs)
      ? (data as Record<string, unknown>).tabs as unknown[]
      : [];

  for (const tab of tabs) {
    if (!tab || typeof tab !== "object") continue;
    const t = tab as Record<string, unknown>;

    const bubbles = Array.isArray(t.bubbles) ? t.bubbles : [];
    if (bubbles.length === 0) continue;

    const messages = bubbles
      .filter((b): b is Record<string, unknown> => b !== null && typeof b === "object")
      .map((b) => ({
        role: (b.type === "user" || b.type === 1 ? "user" : "assistant") as "user" | "assistant",
        text: String(b.text ?? b.rawText ?? b.content ?? "").trim(),
        timestamp: typeof b.timestamp === "number" ? b.timestamp : undefined,
      }))
      .filter((m) => m.text.length > 0);

    if (messages.length === 0) continue;

    conversations.push({
      id: String(t.id ?? t.chatId ?? crypto.randomUUID()),
      messages,
      title: typeof t.title === "string" ? t.title : messages[0]?.text.slice(0, 100),
      startedAt: messages[0]?.timestamp ? new Date(messages[0].timestamp) : undefined,
      endedAt: messages.at(-1)?.timestamp ? new Date(messages.at(-1)!.timestamp!) : undefined,
    });
  }

  return conversations;
}
