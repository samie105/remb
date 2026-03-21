import * as vscode from "vscode";
import type { AuthManager } from "./auth";
import type { ApiClient } from "./api-client";
import type { WorkspaceDetector } from "./workspace";
import type { SyncManager, SyncState } from "./sync";

export class StatusBar {
  private item: vscode.StatusBarItem;
  private errorState: "auth" | "network" | null = null;
  private networkErrorMsg = "";
  private syncState: SyncState | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private auth: AuthManager,
    private workspace: WorkspaceDetector,
    api?: ApiClient,
    syncManager?: SyncManager
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "remb.switchProject";
    this.update();

    this.disposables.push(
      auth.onDidChangeAuth(() => {
        this.errorState = null;
        api?.resetAuthPrompt();
        this.update();
      }),
      workspace.onDidChangeProject(() => this.update())
    );

    if (api) {
      this.disposables.push(
        api.onDidReceiveAuthError(() => {
          this.errorState = "auth";
          this.update();
        }),
        api.onDidReceiveNetworkError((msg) => {
          this.errorState = "network";
          this.networkErrorMsg = msg;
          this.update();
        })
      );
    }

    if (syncManager) {
      this.disposables.push(
        syncManager.onDidChangeSyncState((state) => {
          this.syncState = state;
          // Clear network error on successful sync (connectivity restored)
          if (this.errorState === "network" && state.kind !== "unknown") {
            this.errorState = null;
          }
          this.update();
        })
      );
    }
  }

  private async update() {
    const isAuth = await this.auth.isAuthenticated();

    // Auth error from API (key expired / revoked)
    if (this.errorState === "auth") {
      this.item.text = "$(warning) Remb: Session Expired";
      this.item.tooltip = "API key is invalid or expired. Click to sign in again.";
      this.item.command = "remb.login";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.item.show();
      return;
    }

    // Network error
    if (this.errorState === "network") {
      this.item.text = "$(cloud-offline) Remb: Offline";
      this.item.tooltip = `Cannot reach the Remb server.\n${this.networkErrorMsg}`;
      this.item.command = "remb.switchProject";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      this.item.show();
      return;
    }

    // Not authenticated at all
    if (!isAuth) {
      this.item.text = "$(database) Remb: Sign In";
      this.item.tooltip = "Click to sign in to Remb";
      this.item.command = "remb.login";
      this.item.backgroundColor = undefined;
      this.item.show();
      return;
    }

    // Healthy state
    this.item.backgroundColor = undefined;
    const slug = this.workspace.projectSlug;
    if (slug) {
      const syncIcon = this.getSyncIcon();
      const syncTooltip = this.getSyncTooltip();
      this.item.text = `$(database) Remb: ${slug} ${syncIcon}`;
      this.item.tooltip = `Active project: ${slug}\n${syncTooltip}\nClick to switch`;
      this.item.command = "remb.switchProject";
    } else {
      this.item.text = "$(database) Remb: No project";
      this.item.tooltip = "No .remb.yml found. Run remb init to set up.";
      this.item.command = "remb.openDashboard";
    }
    this.item.show();
  }

  private getSyncIcon(): string {
    if (!this.syncState) return "";
    switch (this.syncState.kind) {
      case "synced": return "$(check)";
      case "behind": return "$(cloud-download)";
      case "scanning": return "$(sync~spin)";
      case "never-scanned": return "$(cloud-upload)";
      case "no-repo": return "$(plug)";
      case "unknown": return this.syncState.message.startsWith("Reconnecting") ? "$(sync~spin)" : "";
      default: return "";
    }
  }

  private getSyncTooltip(): string {
    if (!this.syncState) return "";
    switch (this.syncState.kind) {
      case "synced": return `Synced at ${this.syncState.sha.slice(0, 8)}`;
      case "behind": return `Out of date — new commits since last scan`;
      case "scanning": return "Scan in progress…";
      case "never-scanned": return "Never scanned — trigger a scan to sync";
      case "no-repo": return "No GitHub repo linked";
      case "unknown": return this.syncState.message;
      default: return "";
    }
  }

  dispose() {
    this.item.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
