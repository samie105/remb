import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, platform } from "node:os";
import type { IDEParser, IDEProject, ParsedConversation } from "./types.js";

/**
 * Zed stores conversations as individual JSON files in:
 * macOS/Linux: ~/.local/share/zed/conversations/
 *
 * Each file is named by datetime (e.g., 2023-10-21-14-30.json)
 * and contains prompts and AI responses.
 */
export class ZedParser implements IDEParser {
  readonly id = "zed" as const;
  readonly displayName = "Zed";

  private getBasePath(): string {
    const home = homedir();
    const os = platform();
    if (os === "darwin") {
      return join(home, ".local", "share", "zed", "conversations");
    }
    if (os === "linux") {
      return join(home, ".local", "share", "zed", "conversations");
    }
    // Zed doesn't support Windows natively
    return join(home, ".local", "share", "zed", "conversations");
  }

  async detect(): Promise<boolean> {
    return existsSync(this.getBasePath());
  }

  async listProjects(): Promise<IDEProject[]> {
    const basePath = this.getBasePath();
    if (!existsSync(basePath)) return [];

    // Zed doesn't organize by project — all conversations are in one folder.
    // Treat the entire conversations folder as a single "project".
    try {
      const files = readdirSync(basePath).filter((f) => f.endsWith(".json"));
      if (files.length === 0) return [];

      const stat = statSync(basePath);
      return [{
        id: "zed-conversations",
        name: "Zed Conversations",
        storagePath: basePath,
        lastModified: stat.mtime,
      }];
    } catch {
      return [];
    }
  }

  async parseConversations(_projectId: string): Promise<ParsedConversation[]> {
    const basePath = this.getBasePath();
    if (!existsSync(basePath)) return [];

    const conversations: ParsedConversation[] = [];

    try {
      const files = readdirSync(basePath)
        .filter((f) => f.endsWith(".json"))
        .sort();

      for (const file of files) {
        const filePath = join(basePath, file);
        try {
          const content = readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);
          const parsed = parseZedConversation(data, basename(file, ".json"));
          if (parsed && parsed.messages.length > 0) {
            conversations.push(parsed);
          }
        } catch { /* skip corrupted files */ }
      }
    } catch { /* skip inaccessible directory */ }

    return conversations;
  }
}

function parseZedConversation(data: unknown, fileId: string): ParsedConversation | null {
  if (!data || typeof data !== "object") return null;

  const d = data as Record<string, unknown>;
  const messages: Array<{ role: "user" | "assistant"; text: string }> = [];

  // Zed format: { messages: [{ role, content }] } or { turns: [...] }
  const rawMessages = Array.isArray(d.messages)
    ? d.messages
    : Array.isArray(d.turns)
      ? d.turns
      : [];

  for (const msg of rawMessages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;

    const role = String(m.role ?? "").toLowerCase() === "user" ? "user" as const : "assistant" as const;
    const text = String(m.content ?? m.body ?? m.text ?? "").trim();
    if (!text) continue;

    messages.push({ role, text });
  }

  if (messages.length === 0) return null;

  // Try to parse date from filename (e.g., 2023-10-21-14-30)
  const dateMatch = fileId.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const startedAt = dateMatch ? new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`) : undefined;

  return {
    id: fileId,
    messages,
    startedAt,
    title: typeof d.title === "string" ? d.title : messages[0]?.text.slice(0, 100),
  };
}
