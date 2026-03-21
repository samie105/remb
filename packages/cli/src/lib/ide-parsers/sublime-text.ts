import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, platform } from "node:os";
import type { IDEParser, IDEProject, ParsedConversation } from "./types.js";

/**
 * Sublime Text with LSP-Copilot stores chat history in:
 * macOS: ~/Library/Application Support/Sublime Text/Packages/User/LSP-copilot-history/
 *
 * Each chat is a JSON file named after the project or a timestamp.
 */
export class SublimeTextParser implements IDEParser {
  readonly id = "sublime-text" as const;
  readonly displayName = "Sublime Text (LSP-Copilot)";

  private getBasePath(): string {
    const home = homedir();
    const os = platform();
    if (os === "darwin") {
      return join(home, "Library", "Application Support", "Sublime Text", "Packages", "User", "LSP-copilot-history");
    }
    if (os === "win32") {
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Sublime Text", "Packages", "User", "LSP-copilot-history");
    }
    // Linux
    return join(home, ".config", "sublime-text", "Packages", "User", "LSP-copilot-history");
  }

  async detect(): Promise<boolean> {
    return existsSync(this.getBasePath());
  }

  async listProjects(): Promise<IDEProject[]> {
    const basePath = this.getBasePath();
    if (!existsSync(basePath)) return [];

    try {
      const files = readdirSync(basePath).filter((f) => f.endsWith(".json") || f.endsWith(".md"));
      if (files.length === 0) return [];

      const stat = statSync(basePath);
      return [{
        id: "sublime-text-history",
        name: "Sublime Text Chat History",
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
          const parsed = parseSublimeChat(data, basename(file, ".json"));
          if (parsed && parsed.messages.length > 0) {
            conversations.push(parsed);
          }
        } catch { /* skip corrupted files */ }
      }
    } catch { /* skip inaccessible directory */ }

    return conversations;
  }
}

function parseSublimeChat(data: unknown, fileId: string): ParsedConversation | null {
  if (!data || typeof data !== "object") return null;

  const d = data as Record<string, unknown>;
  const messages: Array<{ role: "user" | "assistant"; text: string }> = [];

  // LSP-Copilot typically stores: { messages: [{ role, content }] } or just an array
  const rawMessages = Array.isArray(data)
    ? data
    : Array.isArray(d.messages)
      ? d.messages
      : Array.isArray(d.history)
        ? d.history
        : [];

  for (const msg of rawMessages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;

    const role = String(m.role ?? "").toLowerCase() === "user" ? "user" as const : "assistant" as const;
    const text = String(m.content ?? m.text ?? m.message ?? "").trim();
    if (!text) continue;

    messages.push({ role, text });
  }

  if (messages.length === 0) return null;

  return {
    id: fileId,
    messages,
    title: typeof d.title === "string" ? d.title : messages[0]?.text.slice(0, 100),
  };
}
