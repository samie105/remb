import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, platform } from "node:os";
import type { IDEParser, IDEProject, ParsedConversation } from "./types.js";

/**
 * Claude Code (CLI) stores conversation history as JSONL files in:
 * macOS/Linux: ~/.claude/projects/
 * Windows: %USERPROFILE%\.claude\projects\
 *
 * Each project folder is named with URL-encoded paths (e.g., Users-dev-web-app)
 * and contains .jsonl files where each line is a message.
 */
export class ClaudeCodeParser implements IDEParser {
  readonly id = "claude-code" as const;
  readonly displayName = "Claude Code";

  private getBasePath(): string {
    const home = homedir();
    if (platform() === "win32") {
      return join(home, ".claude", "projects");
    }
    return join(home, ".claude", "projects");
  }

  async detect(): Promise<boolean> {
    return existsSync(this.getBasePath());
  }

  async listProjects(): Promise<IDEProject[]> {
    const basePath = this.getBasePath();
    if (!existsSync(basePath)) return [];

    const projects: IDEProject[] = [];
    try {
      const entries = readdirSync(basePath);
      for (const entry of entries) {
        const fullPath = join(basePath, entry);
        try {
          const stat = statSync(fullPath);
          if (!stat.isDirectory()) continue;

          // Decode the folder name to get the original workspace path
          const decodedPath = entry.replace(/-/g, "/");

          // Check if there are any .jsonl files
          const files = readdirSync(fullPath).filter((f) => f.endsWith(".jsonl"));
          if (files.length === 0) continue;

          projects.push({
            id: entry,
            name: basename(decodedPath) || entry,
            storagePath: fullPath,
            workspacePath: decodedPath.startsWith("/") ? decodedPath : `/${decodedPath}`,
            lastModified: stat.mtime,
          });
        } catch { /* skip inaccessible */ }
      }
    } catch { /* skip if base dir can't be read */ }

    return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  async parseConversations(projectId: string): Promise<ParsedConversation[]> {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];

    const conversations: ParsedConversation[] = [];

    try {
      const files = readdirSync(project.storagePath)
        .filter((f) => f.endsWith(".jsonl"))
        .sort();

      for (const file of files) {
        const filePath = join(project.storagePath, file);
        try {
          const content = readFileSync(filePath, "utf-8");
          const parsed = parseClaudeJsonl(content, basename(file, ".jsonl"));
          if (parsed && parsed.messages.length > 0) {
            conversations.push(parsed);
          }
        } catch { /* skip corrupted files */ }
      }
    } catch { /* skip inaccessible project */ }

    return conversations;
  }
}

function parseClaudeJsonl(content: string, fileId: string): ParsedConversation | null {
  const lines = content.split("\n").filter((l) => l.trim());
  const messages: Array<{ role: "user" | "assistant" | "tool"; text: string; timestamp?: number }> = [];

  let firstTimestamp: number | undefined;
  let lastTimestamp: number | undefined;

  for (const line of lines) {
    try {
      const msg = JSON.parse(line);

      // Claude Code JSONL can have different formats
      const role = normalizeRole(msg.role ?? msg.type);
      let text = "";

      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Content blocks: [{ type: "text", text: "..." }, ...]
        text = msg.content
          .filter((b: Record<string, unknown>) => b.type === "text" && typeof b.text === "string")
          .map((b: Record<string, unknown>) => b.text)
          .join("\n");
      } else if (typeof msg.message === "string") {
        text = msg.message;
      }

      text = text.trim();
      if (!text) continue;

      const ts = typeof msg.timestamp === "number"
        ? msg.timestamp
        : typeof msg.createdAt === "string"
          ? new Date(msg.createdAt).getTime()
          : undefined;

      if (ts) {
        if (!firstTimestamp) firstTimestamp = ts;
        lastTimestamp = ts;
      }

      messages.push({ role, text, timestamp: ts });
    } catch { /* skip malformed lines */ }
  }

  if (messages.length === 0) return null;

  return {
    id: fileId,
    messages,
    startedAt: firstTimestamp ? new Date(firstTimestamp) : undefined,
    endedAt: lastTimestamp ? new Date(lastTimestamp) : undefined,
    title: messages.find((m) => m.role === "user")?.text.slice(0, 100),
  };
}

function normalizeRole(role: unknown): "user" | "assistant" | "tool" {
  if (typeof role !== "string") return "user";
  const r = role.toLowerCase();
  if (r === "user" || r === "human") return "user";
  if (r === "tool_use" || r === "tool_result" || r === "tool" || r === "system") return "tool";
  return "assistant";
}
