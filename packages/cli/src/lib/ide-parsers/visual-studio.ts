import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, platform } from "node:os";
import type { IDEParser, IDEProject, ParsedConversation } from "./types.js";

/**
 * Visual Studio (Windows only) stores AI conversation history in:
 * %LOCALAPPDATA%\Microsoft\VisualStudio\<version_id>\ConversationHistory\
 *
 * Newer versions use SQLite, older versions use subdirectories by date.
 */
export class VisualStudioParser implements IDEParser {
  readonly id = "visual-studio" as const;
  readonly displayName = "Visual Studio";

  private getBasePath(): string {
    const home = homedir();
    if (platform() === "win32") {
      return join(
        process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"),
        "Microsoft",
        "VisualStudio",
      );
    }
    // VS is Windows-only; provide a path that won't exist on other platforms
    return join(home, ".visual-studio-not-supported");
  }

  async detect(): Promise<boolean> {
    if (platform() !== "win32") return false;

    const basePath = this.getBasePath();
    if (!existsSync(basePath)) return false;

    // Check if any version folder has ConversationHistory
    try {
      const versions = readdirSync(basePath);
      return versions.some((v) => {
        const histPath = join(basePath, v, "ConversationHistory");
        return existsSync(histPath);
      });
    } catch {
      return false;
    }
  }

  async listProjects(): Promise<IDEProject[]> {
    const basePath = this.getBasePath();
    if (!existsSync(basePath)) return [];

    const projects: IDEProject[] = [];
    try {
      const versions = readdirSync(basePath);
      for (const version of versions) {
        const histPath = join(basePath, version, "ConversationHistory");
        if (!existsSync(histPath)) continue;

        const stat = statSync(histPath);
        projects.push({
          id: version,
          name: `Visual Studio ${version}`,
          storagePath: histPath,
          lastModified: stat.mtime,
        });
      }
    } catch { /* skip inaccessible */ }

    return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  async parseConversations(projectId: string): Promise<ParsedConversation[]> {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];

    const conversations: ParsedConversation[] = [];

    // Try SQLite format (newer VS versions)
    const sqliteFiles = findFiles(project.storagePath, ".db");
    for (const dbFile of sqliteFiles) {
      try {
        const parsed = await parseSqliteConversationHistory(dbFile);
        conversations.push(...parsed);
      } catch { /* skip corrupted files */ }
    }

    // Try JSON format (subfolder-based)
    const jsonFiles = findFiles(project.storagePath, ".json");
    for (const jsonFile of jsonFiles) {
      try {
        const raw = readFileSync(jsonFile, "utf-8");
        const data = JSON.parse(raw);
        if (Array.isArray(data.messages)) {
          conversations.push({
            id: basename(jsonFile, ".json"),
            messages: data.messages
              .filter((m: Record<string, unknown>) => m.content || m.text)
              .map((m: Record<string, unknown>) => ({
                role: m.role === "user" ? "user" as const : "assistant" as const,
                text: String(m.content ?? m.text ?? "").trim(),
              })),
            title: data.title ?? undefined,
          });
        }
      } catch { /* skip malformed files */ }
    }

    return conversations;
  }
}

async function parseSqliteConversationHistory(dbPath: string): Promise<ParsedConversation[]> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();

  const fileBuffer = readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  try {
    // Try common table names for VS conversation history
    for (const table of ["Message", "Messages", "ConversationMessage"]) {
      try {
        const results = db.exec(`SELECT * FROM ${table} ORDER BY rowid`);
        if (results.length === 0) continue;

        const cols = results[0].columns;
        const roleIdx = cols.findIndex((c: string) => /role/i.test(c));
        const contentIdx = cols.findIndex((c: string) => /content|text|message/i.test(c));
        const sessionIdx = cols.findIndex((c: string) => /session|conversation/i.test(c));

        if (contentIdx === -1) continue;

        const grouped = new Map<string, ParsedConversation>();

        for (const row of results[0].values) {
          const sessionId = sessionIdx >= 0 ? String(row[sessionIdx] ?? "default") : "default";
          const role = roleIdx >= 0 && String(row[roleIdx]).toLowerCase() === "user" ? "user" as const : "assistant" as const;
          const text = String(row[contentIdx] ?? "").trim();
          if (!text) continue;

          if (!grouped.has(sessionId)) {
            grouped.set(sessionId, { id: sessionId, messages: [] });
          }
          grouped.get(sessionId)!.messages.push({ role, text });
        }

        return [...grouped.values()].filter((c) => c.messages.length > 0);
      } catch { /* table doesn't exist, try next */ }
    }

    return [];
  } finally {
    db.close();
  }
}

function findFiles(dir: string, ext: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findFiles(fullPath, ext));
      } else if (entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  } catch { /* skip inaccessible directories */ }
  return files;
}
