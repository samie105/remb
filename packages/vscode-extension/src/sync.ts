import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import type { ApiClient } from "./api-client";
import type { WorkspaceDetector } from "./workspace";
import type { AuthManager } from "./auth";
import type { SyncStatusResponse } from "./types";

const execFileAsync = promisify(execFile);

/* ─── Sync state ─── */

export type SyncState =
  | { kind: "synced"; sha: string; lastScanAt: string }
  | { kind: "behind"; currentSha: string; lastScannedSha: string; lastScanAt: string | null }
  | { kind: "never-scanned" }
  | { kind: "no-repo" }
  | { kind: "scanning" }
  | { kind: "unknown"; message: string }
  | { kind: "unauthenticated" };

/**
 * SyncManager — periodically checks sync status and exposes state for
 * the status bar, changes tree view, and commands.
 */
export class SyncManager {
  private _onDidChangeSyncState = new vscode.EventEmitter<SyncState>();
  readonly onDidChangeSyncState = this._onDidChangeSyncState.event;

  private _state: SyncState = { kind: "unauthenticated" };
  private _response: SyncStatusResponse | null = null;
  private _timer: ReturnType<typeof setInterval> | undefined;
  private disposables: vscode.Disposable[] = [];

  get state() {
    return this._state;
  }

  get lastResponse() {
    return this._response;
  }

  constructor(
    private api: ApiClient,
    private workspace: WorkspaceDetector,
    private auth: AuthManager
  ) {
    this.disposables.push(
      workspace.onDidChangeProject(() => this.check()),
      auth.onDidChangeAuth(() => this.check())
    );
  }

  /** Start periodic sync checking (every 2 minutes). */
  start() {
    this.check();
    this._timer = setInterval(() => this.check(), 120_000);
  }

  /** Manually trigger a sync check. */
  async check(): Promise<SyncState> {
    const slug = this.workspace.projectSlug;
    const isAuth = await this.auth.isAuthenticated();

    if (!isAuth) {
      return this.setState({ kind: "unauthenticated" });
    }
    if (!slug) {
      return this.setState({ kind: "unknown", message: "No project detected" });
    }

    try {
      const resp = await this.api.getSyncStatus(slug);
      this._response = resp;

      if (!resp.hasRepo) {
        return this.setState({ kind: "no-repo" });
      }
      if (resp.status === "scanning") {
        return this.setState({ kind: "scanning" });
      }
      if (resp.synced && resp.currentSha && resp.lastScanAt) {
        return this.setState({ kind: "synced", sha: resp.currentSha, lastScanAt: resp.lastScanAt });
      }
      if (resp.lastScannedSha === null) {
        return this.setState({ kind: "never-scanned" });
      }
      return this.setState({
        kind: "behind",
        currentSha: resp.currentSha ?? "unknown",
        lastScannedSha: resp.lastScannedSha,
        lastScanAt: resp.lastScanAt,
      });
    } catch {
      return this.setState({ kind: "unknown", message: "Could not check sync status" });
    }
  }

  private setState(state: SyncState): SyncState {
    this._state = state;
    this._onDidChangeSyncState.fire(state);
    return state;
  }

  dispose() {
    if (this._timer) clearInterval(this._timer);
    this._onDidChangeSyncState.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

/* ─── Changes Tree (files changed since last scan) ─── */

type ChangeItem = ChangedFileNode | StatusMessageNode;

class ChangedFileNode {
  constructor(
    public filePath: string,
    public status: "A" | "M" | "D" | "R" | string
  ) {}
}

class StatusMessageNode {
  constructor(
    public message: string,
    public icon: string = "info"
  ) {}
}

export class ChangesTreeProvider implements vscode.TreeDataProvider<ChangeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChangeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private changes: ChangedFileNode[] = [];
  private statusMessage: string | null = null;

  constructor(private syncManager: SyncManager) {
    syncManager.onDidChangeSyncState(() => this.refresh());
  }

  refresh() {
    this.changes = [];
    this.statusMessage = null;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ChangeItem): vscode.TreeItem {
    if (element instanceof StatusMessageNode) {
      const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(element.icon);
      return item;
    }

    const statusLabels: Record<string, string> = {
      A: "Added",
      M: "Modified",
      D: "Deleted",
      R: "Renamed",
    };
    const statusIcons: Record<string, string> = {
      A: "diff-added",
      M: "diff-modified",
      D: "diff-removed",
      R: "diff-renamed",
    };

    const label = element.filePath.split("/").pop() ?? element.filePath;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = element.filePath;
    item.tooltip = `${statusLabels[element.status] ?? element.status}: ${element.filePath}`;
    item.iconPath = new vscode.ThemeIcon(statusIcons[element.status] ?? "file");
    item.contextValue = "changedFile";

    // Open file on click
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders?.length && element.status !== "D") {
      const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, element.filePath);
      item.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [fileUri],
      };
    }

    return item;
  }

  async getChildren(): Promise<ChangeItem[]> {
    const state = this.syncManager.state;

    if (state.kind === "unauthenticated") {
      return [new StatusMessageNode("Sign in to see changes", "lock")];
    }
    if (state.kind === "no-repo") {
      return [new StatusMessageNode("No GitHub repo linked", "plug")];
    }
    if (state.kind === "never-scanned") {
      return [new StatusMessageNode("Project never scanned — run a scan first", "cloud-upload")];
    }
    if (state.kind === "synced") {
      return [new StatusMessageNode("Up to date — no changes since last scan", "check")];
    }
    if (state.kind === "scanning") {
      return [new StatusMessageNode("Scan in progress…", "sync~spin")];
    }
    if (state.kind === "unknown") {
      return [new StatusMessageNode(state.message, "question")];
    }

    if (state.kind !== "behind") {
      return [];
    }

    // Get changed files using local git
    if (this.changes.length > 0) {
      return this.changes;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
      return [new StatusMessageNode("No workspace folder open", "warning")];
    }

    const cwd = workspaceFolders[0].uri.fsPath;

    try {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--name-status", state.lastScannedSha],
        { cwd, timeout: 10_000 }
      );

      const lines = stdout.trim().split("\n").filter(Boolean);
      if (lines.length === 0) {
        return [new StatusMessageNode("No file changes detected (commits differ)", "info")];
      }

      this.changes = lines.map((line) => {
        const [status, ...parts] = line.split("\t");
        return new ChangedFileNode(parts.join("\t"), status);
      });

      return this.changes;
    } catch (err) {
      // SHA might not be available locally
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("bad object") || msg.includes("unknown revision")) {
        // Try fetching first
        try {
          await execFileAsync("git", ["fetch", "--depth=1", "origin", state.lastScannedSha], {
            cwd,
            timeout: 15_000,
          });
          return this.getChildren(); // Retry after fetch
        } catch {
          return [
            new StatusMessageNode(
              `Scan SHA ${state.lastScannedSha.slice(0, 8)} not available locally`,
              "warning"
            ),
            new StatusMessageNode("Run 'git fetch' to sync", "terminal"),
          ];
        }
      }
      return [new StatusMessageNode(`Git error: ${msg.slice(0, 80)}`, "error")];
    }
  }
}
