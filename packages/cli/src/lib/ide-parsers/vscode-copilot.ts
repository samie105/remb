import type { IDEParser, IDEProject, ParsedConversation } from "./types.js";
import {
  detectWorkspaceStorage,
  listWorkspaceProjects,
  queryVscdb,
} from "./vscdb-base.js";
import { join } from "node:path";

const APP_NAME = "Code";
const CHAT_KEY = "github.copilot.chat.history";

export class VSCodeCopilotParser implements IDEParser {
  readonly id = "vscode" as const;
  readonly displayName = "VS Code (Copilot)";

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
      return parseCopilotHistory(chatData);
    } catch {
      return [];
    }
  }
}

/**
 * VS Code Copilot Chat stores history as:
 * { sessions: [{ id, turns: [{ request: { message }, response: { message } }] }] }
 * or older format: array of { id, exchanges: [{ prompt, response }] }
 */
function parseCopilotHistory(data: unknown): ParsedConversation[] {
  if (!data || typeof data !== "object") return [];

  const conversations: ParsedConversation[] = [];
  const d = data as Record<string, unknown>;

  // Handle both array and { sessions: [...] } formats
  const sessions = Array.isArray(data) ? data : Array.isArray(d.sessions) ? d.sessions : [];

  for (const session of sessions) {
    if (!session || typeof session !== "object") continue;
    const s = session as Record<string, unknown>;

    const messages: Array<{ role: "user" | "assistant"; text: string; timestamp?: number }> = [];

    // Format 1: turns with request/response
    const turns = Array.isArray(s.turns) ? s.turns : [];
    for (const turn of turns) {
      if (!turn || typeof turn !== "object") continue;
      const t = turn as Record<string, unknown>;

      const req = t.request as Record<string, unknown> | undefined;
      const res = t.response as Record<string, unknown> | undefined;

      if (req?.message && typeof req.message === "string") {
        messages.push({ role: "user", text: req.message.trim() });
      }
      if (res?.message && typeof res.message === "string") {
        messages.push({ role: "assistant", text: res.message.trim() });
      }
    }

    // Format 2: exchanges with prompt/response
    const exchanges = Array.isArray(s.exchanges) ? s.exchanges : [];
    for (const ex of exchanges) {
      if (!ex || typeof ex !== "object") continue;
      const e = ex as Record<string, unknown>;

      if (e.prompt && typeof e.prompt === "string") {
        messages.push({ role: "user", text: e.prompt.trim() });
      }
      if (e.response && typeof e.response === "string") {
        messages.push({ role: "assistant", text: e.response.trim() });
      }
    }

    if (messages.length === 0) continue;

    conversations.push({
      id: String(s.id ?? s.sessionId ?? crypto.randomUUID()),
      messages,
      title: typeof s.title === "string" ? s.title : messages[0]?.text.slice(0, 100),
    });
  }

  return conversations;
}
