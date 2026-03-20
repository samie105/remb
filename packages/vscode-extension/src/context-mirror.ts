import * as vscode from "vscode";
import * as path from "path";
import type { ApiClient } from "./api-client";
import type { WorkspaceDetector } from "./workspace";
import type { AuthManager } from "./auth";

/**
 * Maximum size (bytes) of a single .md context file before splitting
 * into numbered parts. 32 KB keeps files fast to open and parse.
 */
const MAX_FILE_BYTES = 32_768;

/** Extensions worth tracking for the mirror. */
const MIRROR_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".swift",
  ".css", ".scss", ".sass", ".less",
  ".html", ".vue", ".svelte",
  ".sql", ".graphql", ".gql",
  ".json", ".yaml", ".yml", ".toml",
  ".md", ".mdx",
  ".sh", ".bash",
]);

const IGNORE_SEGMENTS = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".turbo", ".vercel",
  "__pycache__", ".pytest_cache", "dist", "build", ".remb",
]);

function shouldMirror(relPath: string): boolean {
  const segments = relPath.split("/");
  if (segments.some((s) => IGNORE_SEGMENTS.has(s))) return false;
  const ext = path.extname(relPath).toLowerCase();
  return MIRROR_EXTENSIONS.has(ext);
}

/**
 * Convert a source file path to its `.remb/` mirror path.
 * e.g. `app/page.tsx` → `.remb/app/page.md`
 */
function toMirrorPath(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(".remb", parsed.dir, `${parsed.name}.md`);
}

/**
 * Numbered file path for overflow.
 * e.g. `.remb/app/page.md` → `.remb/app/page.2.md`
 */
function numberedPath(base: string, n: number): string {
  const parsed = path.parse(base);
  return path.join(parsed.dir, `${parsed.name}.${n}${parsed.ext}`);
}

/**
 * ContextMirror — mirrors the project file structure into `.remb/`
 * with context-rich markdown files that any AI agent can read.
 *
 * Flow:
 * 1. On activation + periodically, fetches per-file context from the API
 * 2. Writes `.remb/<path>.md` files mirroring the project structure
 * 3. On file save, marks that file as dirty for next sync
 * 4. When a context file exceeds MAX_FILE_BYTES, creates numbered overflow files
 */
export class ContextMirror implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private dirtyFiles = new Set<string>();
  private isSyncing = false;
  /** Cached dependency data from last full sync */
  private fileDeps: Record<string, { imports: string[]; importedBy: string[] }> = {};
  /** Cached conversation data from last full sync */
  private fileConversations: Record<string, Array<{ summary: string; timestamp: string; relatedFiles: string[] }>> = {};

  constructor(
    private api: ApiClient,
    private workspace: WorkspaceDetector,
    private auth: AuthManager,
  ) {}

  /** Start watching and syncing. Call once after activation. */
  start(): void {
    // Watch file saves to track dirty files
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const rel = vscode.workspace.asRelativePath(doc.uri, false);
        if (shouldMirror(rel)) {
          this.dirtyFiles.add(rel);
        }
      }),
    );

    // Re-sync on project change
    this.disposables.push(
      this.workspace.onDidChangeProject(() => this.fullSync()),
      this.auth.onDidChangeAuth((isAuth) => { if (isAuth) this.fullSync(); }),
    );

    // Initial sync after a short delay (let everything initialize)
    setTimeout(() => this.fullSync(), 5_000);

    // Incremental sync every 2 minutes (only dirty files), full sync every 10 minutes
    let tickCount = 0;
    this.refreshTimer = setInterval(() => {
      tickCount++;
      if (tickCount % 5 === 0) {
        this.fullSync(); // Full sync every 10 minutes
      } else if (this.dirtyFiles.size > 0) {
        this.incrementalSync(); // Incremental only when dirty files exist
      }
    }, 2 * 60_000);
  }

  /** Full sync: fetch all file contexts from API and write .remb/ mirror. */
  async fullSync(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const slug = this.workspace.projectSlug;
      const isAuth = await this.auth.isAuthenticated();
      if (!slug || !isAuth) return;

      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!root) return;

      const resp = await this.api.getFileContextMap(slug);
      if (!resp?.files) return;

      // Cache dependency data for incremental syncs
      this.fileDeps = resp.dependencies ?? {};
      this.fileConversations = resp.conversations ?? {};

      const rembDir = vscode.Uri.joinPath(root, ".remb");

      // Ensure .remb directory exists
      try { await vscode.workspace.fs.createDirectory(rembDir); } catch { /* exists */ }

      // Write an index.md with project overview
      await this.writeIndex(root, slug, resp.files);

      // Track expected mirror paths for stale file cleanup
      const expectedPaths = new Set<string>();
      expectedPaths.add(".remb/index.md");

      // Write per-file context mirrors (with dependency info)
      for (const [filePath, entries] of Object.entries(resp.files)) {
        if (!shouldMirror(filePath) || entries.length === 0) continue;
        const mirrorRel = toMirrorPath(filePath);
        expectedPaths.add(mirrorRel);
        await this.writeMirrorFile(root, filePath, entries, this.fileDeps[filePath], this.fileConversations[filePath]);
      }

      // Clean up stale .remb/ files not in the expected set
      await this.cleanStaleMirrorFiles(root, expectedPaths);

      // Clear dirty files since we just synced everything
      this.dirtyFiles.clear();
    } catch {
      // Non-fatal — mirror is best-effort
    } finally {
      this.isSyncing = false;
    }
  }

  /** Incremental sync: only re-fetch and update dirty files. */
  async incrementalSync(): Promise<void> {
    if (this.isSyncing || this.dirtyFiles.size === 0) return;
    this.isSyncing = true;

    const filesToSync = [...this.dirtyFiles];
    this.dirtyFiles.clear();

    try {
      const slug = this.workspace.projectSlug;
      const isAuth = await this.auth.isAuthenticated();
      if (!slug || !isAuth) return;

      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!root) return;

      // Fetch full context map (API doesn't support per-file queries yet)
      // but only write the dirty files
      const resp = await this.api.getFileContextMap(slug);
      if (!resp?.files) return;

      // Update cached deps
      if (resp.dependencies) this.fileDeps = resp.dependencies;
      if (resp.conversations) this.fileConversations = resp.conversations;

      for (const filePath of filesToSync) {
        const entries = resp.files[filePath];
        if (!entries || entries.length === 0) continue;
        await this.writeMirrorFile(root, filePath, entries, this.fileDeps[filePath], this.fileConversations[filePath]);
      }
    } catch {
      // Non-fatal — re-add files as dirty for next attempt
      for (const f of filesToSync) this.dirtyFiles.add(f);
    } finally {
      this.isSyncing = false;
    }
  }

  /** Write or update a single mirror file. Splits when too large. */
  private async writeMirrorFile(
    root: vscode.Uri,
    filePath: string,
    entries: Array<{
      feature: string;
      featureDescription: string | null;
      content: string;
      category: string;
      importance: number;
      entryType: string;
      tags: string[];
      updatedAt: string;
    }>,
    deps?: { imports: string[]; importedBy: string[] },
    conversations?: Array<{ summary: string; timestamp: string; relatedFiles: string[] }>,
  ): Promise<void> {
    const mirrorRel = toMirrorPath(filePath);

    // Build the markdown content
    const headerLines = [
      `# ${filePath}`,
      `> Auto-generated context by Remb. Updated: ${new Date().toISOString().slice(0, 16)}`,
      `> Source: \`${filePath}\``,
    ];

    // Dependency info
    if (deps) {
      if (deps.imports.length > 0) {
        headerLines.push(`> **Imports:** ${deps.imports.slice(0, 10).join(", ")}${deps.imports.length > 10 ? ` (+${deps.imports.length - 10} more)` : ""}`);
      }
      if (deps.importedBy.length > 0) {
        headerLines.push(`> **Imported by:** ${deps.importedBy.slice(0, 10).join(", ")}${deps.importedBy.length > 10 ? ` (+${deps.importedBy.length - 10} more)` : ""}`);
      }
    }
    headerLines.push("");

    const header = headerLines.join("\n");

    const sections: string[] = [];
    for (const entry of entries) {
      const section = [
        `## ${entry.feature}`,
        `**Category:** ${entry.category} | **Importance:** ${entry.importance}/10 | **Type:** ${entry.entryType}`,
        entry.featureDescription ? `> ${entry.featureDescription}` : "",
        "",
        entry.content,
        "",
        entry.tags.length > 0 ? `**Tags:** ${entry.tags.join(", ")}` : "",
        `_Last updated: ${entry.updatedAt.slice(0, 16)}_`,
        "",
        "---",
        "",
      ].filter(Boolean).join("\n");
      sections.push(section);
    }

    const fullContent = header + sections.join("") + this.buildConversationsSection(conversations);
    const contentBytes = Buffer.byteLength(fullContent, "utf-8");

    if (contentBytes <= MAX_FILE_BYTES) {
      // Single file — write it directly
      await this.writeFile(root, mirrorRel, fullContent);
    } else {
      // Split into numbered files
      let currentChunk = header;
      let chunkNum = 1;

      for (const section of sections) {
        const combined = currentChunk + section;
        if (Buffer.byteLength(combined, "utf-8") > MAX_FILE_BYTES && currentChunk !== header) {
          // Write current chunk and start a new one
          await this.writeFile(root, numberedPath(mirrorRel, chunkNum), currentChunk);
          chunkNum++;
          currentChunk = header + section;
        } else {
          currentChunk = combined;
        }
      }

      // Write the last chunk
      if (currentChunk !== header) {
        await this.writeFile(
          root,
          chunkNum === 1 ? mirrorRel : numberedPath(mirrorRel, chunkNum),
          currentChunk,
        );
      }
    }
  }

  /** Build a markdown section for recent conversations that affected this file. */
  private buildConversationsSection(
    conversations?: Array<{ summary: string; timestamp: string; relatedFiles: string[] }>,
  ): string {
    if (!conversations || conversations.length === 0) return "";

    const lines = [
      "## Recent Changes & Conversations",
      "",
    ];

    // Show up to 5 most recent conversations
    for (const conv of conversations.slice(0, 5)) {
      const date = conv.timestamp.slice(0, 10);
      const time = conv.timestamp.slice(11, 16);
      lines.push(`### ${date} ${time}`);
      lines.push(`> ${conv.summary.slice(0, 300)}`);
      if (conv.relatedFiles.length > 0) {
        lines.push(`**Related files:** ${conv.relatedFiles.slice(0, 8).join(", ")}${conv.relatedFiles.length > 8 ? ` (+${conv.relatedFiles.length - 8} more)` : ""}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /** Write the .remb/index.md file with a project structure overview. */
  private async writeIndex(
    root: vscode.Uri,
    slug: string,
    files: Record<string, unknown[]>,
  ): Promise<void> {
    const filePaths = Object.keys(files).sort();

    // Group by top-level directory
    const dirGroups = new Map<string, string[]>();
    for (const fp of filePaths) {
      const dir = fp.includes("/") ? fp.split("/")[0] : ".";
      if (!dirGroups.has(dir)) dirGroups.set(dir, []);
      dirGroups.get(dir)!.push(fp);
    }

    const lines = [
      `# ${slug} — Context Mirror`,
      `> Auto-generated by Remb. ${filePaths.length} files with context.`,
      `> Updated: ${new Date().toISOString().slice(0, 16)}`,
      "",
      "## Structure",
      "",
    ];

    for (const [dir, paths] of [...dirGroups.entries()].sort()) {
      lines.push(`### ${dir}/`);
      for (const fp of paths) {
        const mirrorRel = toMirrorPath(fp);
        // Links are relative to .remb/ directory since index.md is inside it
        const linkTarget = mirrorRel.replace(/^\.remb\//, "");
        lines.push(`- [${fp}](${linkTarget})`);
      }
      lines.push("");
    }

    await this.writeFile(root, ".remb/index.md", lines.join("\n"));
  }

  /** Write a file, creating parent directories as needed. */
  private async writeFile(root: vscode.Uri, relPath: string, content: string): Promise<void> {
    const fileUri = vscode.Uri.joinPath(root, relPath);
    const dirUri = vscode.Uri.joinPath(root, path.dirname(relPath));

    try { await vscode.workspace.fs.createDirectory(dirUri); } catch { /* exists */ }
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf-8"));
  }

  /** Remove .remb/ files that are no longer in the API response. */
  private async cleanStaleMirrorFiles(
    root: vscode.Uri,
    expectedPaths: Set<string>,
  ): Promise<void> {
    const rembDir = vscode.Uri.joinPath(root, ".remb");
    try {
      await this.walkAndClean(root, rembDir, expectedPaths);
    } catch { /* .remb dir might not exist */ }
  }

  private async walkAndClean(
    root: vscode.Uri,
    dir: vscode.Uri,
    expectedPaths: Set<string>,
  ): Promise<void> {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    for (const [name, type] of entries) {
      const childUri = vscode.Uri.joinPath(dir, name);
      if (type === vscode.FileType.Directory) {
        await this.walkAndClean(root, childUri, expectedPaths);
      } else if (name.endsWith(".md")) {
        // Skip session.md — that's managed by ConversationCapture
        if (name === "session.md") continue;
        const rel = vscode.workspace.asRelativePath(childUri, false);
        if (!expectedPaths.has(rel)) {
          try { await vscode.workspace.fs.delete(childUri); } catch { /* best-effort */ }
        }
      }
    }
  }

  dispose(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
