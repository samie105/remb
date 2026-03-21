import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, platform } from "node:os";
import type { IDEProject, ConversationMessage } from "./types.js";

/**
 * Shared logic for VS Code-family IDEs that store chat data in state.vscdb
 * (SQLite database with ItemTable key-value store).
 *
 * Used by: Cursor, VS Code (Copilot), Windsurf, Visual Studio
 */

/** OS-aware workspace storage root paths for a given app data folder name */
export function getWorkspaceStoragePath(appName: string): string {
  const home = homedir();
  const os = platform();

  switch (os) {
    case "darwin":
      return join(home, "Library", "Application Support", appName, "User", "workspaceStorage");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), appName, "User", "workspaceStorage");
    case "linux":
      return join(home, ".config", appName, "User", "workspaceStorage");
    default:
      return join(home, ".config", appName, "User", "workspaceStorage");
  }
}

/** Detect whether a workspace storage directory exists */
export function detectWorkspaceStorage(appName: string): boolean {
  const storagePath = getWorkspaceStoragePath(appName);
  return existsSync(storagePath);
}

/** List all workspace projects from hash-named subfolders */
export function listWorkspaceProjects(appName: string): IDEProject[] {
  const storagePath = getWorkspaceStoragePath(appName);
  if (!existsSync(storagePath)) return [];

  const projects: IDEProject[] = [];
  const entries = readdirSync(storagePath);

  for (const entry of entries) {
    const fullPath = join(storagePath, entry);
    try {
      const stat = statSync(fullPath);
      if (!stat.isDirectory()) continue;

      // Try to read workspace.json to resolve project name/path
      const wsFile = join(fullPath, "workspace.json");
      let name = entry;
      let workspacePath: string | undefined;

      if (existsSync(wsFile)) {
        try {
          const wsData = JSON.parse(readFileSync(wsFile, "utf-8"));
          const folder = wsData.folder ?? wsData.workspace;
          if (typeof folder === "string") {
            // folder is typically a file:// URI
            const decoded = folder.replace(/^file:\/\//, "");
            workspacePath = decodeURIComponent(decoded);
            name = basename(workspacePath);
          }
        } catch { /* ignore malformed workspace.json */ }
      }

      // Check that state.vscdb exists
      const vscdbPath = join(fullPath, "state.vscdb");
      if (!existsSync(vscdbPath)) continue;

      projects.push({
        id: entry,
        name,
        storagePath: fullPath,
        workspacePath,
        lastModified: stat.mtime,
      });
    } catch { /* skip inaccessible folders */ }
  }

  return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

/**
 * Query an ItemTable key from a state.vscdb SQLite database.
 * Returns the raw JSON string value, or null if key not found.
 */
export async function queryVscdb(dbPath: string, key: string): Promise<string | null> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();

  const fileBuffer = readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  try {
    const results = db.exec(`SELECT value FROM ItemTable WHERE key = '${key.replace(/'/g, "''")}'`);
    if (results.length === 0 || results[0].values.length === 0) return null;

    const value = results[0].values[0][0];
    return typeof value === "string" ? value : null;
  } finally {
    db.close();
  }
}

/**
 * Query all keys matching a pattern from state.vscdb.
 * Returns key-value pairs.
 */
export async function queryVscdbLike(dbPath: string, keyPattern: string): Promise<Array<{ key: string; value: string }>> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();

  const fileBuffer = readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  try {
    const results = db.exec(`SELECT key, value FROM ItemTable WHERE key LIKE '${keyPattern.replace(/'/g, "''")}'`);
    if (results.length === 0) return [];

    return results[0].values
      .filter((row: unknown[]) => typeof row[0] === "string" && typeof row[1] === "string")
      .map((row: unknown[]) => ({ key: row[0] as string, value: row[1] as string }));
  } finally {
    db.close();
  }
}

/** Parse a generic chat data JSON structure into conversations */
export function parseChatMessages(
  messages: Array<{ role?: string; content?: string; text?: string; message?: string; timestamp?: number | string }>,
): ConversationMessage[] {
  return messages
    .filter((m) => (m.content ?? m.text ?? m.message)?.trim())
    .map((m) => ({
      role: normalizeRole(m.role),
      text: (m.content ?? m.text ?? m.message ?? "").trim(),
      timestamp: typeof m.timestamp === "number" ? m.timestamp : undefined,
    }));
}

function normalizeRole(role?: string): "user" | "assistant" | "tool" {
  if (!role) return "user";
  const r = role.toLowerCase();
  if (r === "user" || r === "human") return "user";
  if (r === "tool" || r === "function" || r === "system") return "tool";
  return "assistant";
}
