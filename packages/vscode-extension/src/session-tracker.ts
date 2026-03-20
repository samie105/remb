import * as vscode from "vscode";
import type { ApiClient } from "./api-client";
import type { WorkspaceDetector } from "./workspace";
import type { AuthManager } from "./auth";

/**
 * Automatically tracks the coding session lifecycle and logs it to
 * the Remb API — no model cooperation required.
 *
 * - Extension activates → logs "session_start"
 * - Tracks file modifications via onDidSaveTextDocument
 * - Extension deactivates → logs "session_end" with summary
 */
export class SessionTracker implements vscode.Disposable {
  private modifiedFiles = new Set<string>();
  private disposables: vscode.Disposable[] = [];
  private sessionStartTime = new Date();

  private started = false;

  constructor(
    private api: ApiClient,
    private workspace: WorkspaceDetector,
    private auth: AuthManager
  ) {}

  /** Start tracking. Call once after extension activates. */
  async start(): Promise<void> {
    // Listen for late auth so the tracker can initialize if user signs in after activation
    this.disposables.push(
      this.auth.onDidChangeAuth(async (isLoggedIn) => {
        if (isLoggedIn && !this.started) {
          await this.initSession();
        }
      })
    );

    await this.initSession();
  }

  private async initSession(): Promise<void> {
    if (this.started) return;
    const isAuth = await this.auth.isAuthenticated();
    const slug = this.workspace.projectSlug;
    if (!isAuth || !slug) return;
    this.started = true;

    // Log session start (fire-and-forget, non-blocking)
    this.api
      .logConversation({
        content: `IDE session started for project "${slug}" (VS Code).`,
        projectSlug: slug,
        type: "tool_call",
      })
      .catch(() => {});

    // Track file saves throughout the session
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const rel = vscode.workspace.asRelativePath(doc.uri, false);
        if (!rel.startsWith(".git/") && !rel.includes("node_modules") && !rel.startsWith(".remb/")) {
          this.modifiedFiles.add(rel);
        }
      })
    );

    // Re-log if the project changes mid-session
    this.disposables.push(
      this.workspace.onDidChangeProject((config) => {
        if (config?.project) {
          this.api
            .logConversation({
              content: `Switched to project "${config.project}" in VS Code.`,
              projectSlug: config.project,
              type: "tool_call",
            })
            .catch(() => {});
        }
      })
    );
  }

  /**
   * Log session end. Called from deactivate().
   * Returns a promise — VS Code will wait briefly for it.
   */
  async end(): Promise<void> {
    const isAuth = await this.auth.isAuthenticated();
    const slug = this.workspace.projectSlug;
    if (!isAuth || !slug) return;

    const durationMin = Math.round(
      (Date.now() - this.sessionStartTime.getTime()) / 1000 / 60
    );
    const files = [...this.modifiedFiles];

    const summary =
      files.length > 0
        ? `IDE session ended (~${durationMin}min). Files modified (${files.length}): ${files.slice(0, 20).join(", ")}${files.length > 20 ? ` (+${files.length - 20} more)` : ""}`
        : `IDE session ended (~${durationMin}min). No files modified.`;

    try {
      await this.api.logConversation({
        content: summary,
        projectSlug: slug,
        type: "summary",
      });
    } catch {
      // Non-fatal — VS Code is shutting down
    }
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
