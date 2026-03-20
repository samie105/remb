import * as vscode from "vscode";
import type { ProjectConfig } from "./types";

/**
 * Detects and watches .remb.yml in the workspace to determine
 * the active project slug and API URL.
 */
export class WorkspaceDetector {
  private _onDidChangeProject = new vscode.EventEmitter<ProjectConfig | null>();
  readonly onDidChangeProject = this._onDidChangeProject.event;

  private _config: ProjectConfig | null = null;
  private watcher: vscode.FileSystemWatcher | undefined;

  get config() {
    return this._config;
  }

  get projectSlug() {
    return this._config?.project ?? null;
  }

  async initialize(): Promise<void> {
    await this.detect();

    this.watcher = vscode.workspace.createFileSystemWatcher("**/.remb.yml");
    this.watcher.onDidCreate(() => this.detect());
    this.watcher.onDidChange(() => this.detect());
    this.watcher.onDidDelete(() => {
      this._config = null;
      this._onDidChangeProject.fire(null);
    });
  }

  private async detect(): Promise<void> {
    // Search root first, then subdirectories for monorepo support
    let files = await vscode.workspace.findFiles(".remb.yml", null, 1);
    if (files.length === 0) {
      files = await vscode.workspace.findFiles("**/.remb.yml", "**/node_modules/**", 1);
    }
    if (files.length === 0) {
      this._config = null;
      this._onDidChangeProject.fire(null);
      return;
    }

    try {
      const raw = await vscode.workspace.fs.readFile(files[0]);
      const text = Buffer.from(raw).toString("utf-8");
      this._config = parseSimpleYaml(text);
      this._onDidChangeProject.fire(this._config);
    } catch {
      this._config = null;
      this._onDidChangeProject.fire(null);
    }
  }

  dispose() {
    this._onDidChangeProject.dispose();
    this.watcher?.dispose();
  }

  /**
   * Write (or create) .remb.yml with the given project slug.
   * Used by "Set Active Project" to link this workspace to a cloud project.
   */
  async setProjectSlug(slug: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error("No workspace folder open");
    }
    const rootUri = folders[0].uri;
    const rembYmlUri = vscode.Uri.joinPath(rootUri, ".remb.yml");

    // Preserve existing content but update the project: line
    let existingLines: string[] = [];
    try {
      const raw = await vscode.workspace.fs.readFile(rembYmlUri);
      existingLines = Buffer.from(raw).toString("utf-8").split("\n");
    } catch {
      // File doesn't exist yet — start fresh
    }

    let projectLineFound = false;
    const updated = existingLines.map((line) => {
      if (/^\s*project\s*:/.test(line)) {
        projectLineFound = true;
        return `project: ${slug}`;
      }
      return line;
    });
    if (!projectLineFound) {
      updated.unshift(`project: ${slug}`);
    }

    const content = updated.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    await vscode.workspace.fs.writeFile(rembYmlUri, Buffer.from(content, "utf-8"));
    // detect() will fire automatically via the watcher, but also call it directly
    await this.detect();
  }
}

function parseSimpleYaml(raw: string): ProjectConfig {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments (only when not inside quotes)
      const hashIdx = value.indexOf(" #");
      if (hashIdx !== -1) {
        value = value.slice(0, hashIdx).trim();
      }
    }
    result[key] = value;
  }
  return {
    project: result.project ?? "",
    api_url: result.api_url ?? "https://www.useremb.com",
    ide: result.ide || undefined,
  };
}
