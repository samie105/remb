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

    // Periodic sync every 5 minutes
    this.refreshTimer = setInterval(() => this.fullSync(), 5 * 60_000);
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

      const rembDir = vscode.Uri.joinPath(root, ".remb");

      // Ensure .remb directory exists
      try { await vscode.workspace.fs.createDirectory(rembDir); } catch { /* exists */ }

      // Write an index.md with project overview
      await this.writeIndex(root, slug, resp.files);

      // Write per-file context mirrors
      for (const [filePath, entries] of Object.entries(resp.files)) {
        if (!shouldMirror(filePath) || entries.length === 0) continue;
        await this.writeMirrorFile(root, filePath, entries);
      }

      // Clear dirty files since we just synced everything
      this.dirtyFiles.clear();
    } catch {
      // Non-fatal — mirror is best-effort
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
  ): Promise<void> {
    const mirrorRel = toMirrorPath(filePath);

    // Build the markdown content
    const header = [
      `# ${filePath}`,
      `> Auto-generated context by Remb. Updated: ${new Date().toISOString().slice(0, 16)}`,
      `> Source: \`${filePath}\``,
      "",
    ].join("\n");

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

    const fullContent = header + sections.join("");
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
        lines.push(`- [${fp}](${mirrorRel})`);
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

  dispose(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
