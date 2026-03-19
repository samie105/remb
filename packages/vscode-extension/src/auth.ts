import * as vscode from "vscode";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const SECRET_KEY = "remb.apiKey";
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

export class AuthManager {
  private _onDidChangeAuth = new vscode.EventEmitter<boolean>();
  readonly onDidChangeAuth = this._onDidChangeAuth.event;

  constructor(private secrets: vscode.SecretStorage) {}

  async getApiKey(): Promise<string | undefined> {
    return this.secrets.get(SECRET_KEY);
  }

  async isAuthenticated(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key;
  }

  /** Browser OAuth login — same flow as the CLI. */
  async login(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration("remb");
    const baseUrl = (config.get<string>("apiUrl") ?? "https://www.useremb.com").replace(/\/+$/, "");

    // Start OAuth session
    let state: string;
    let authUrl: string;
    try {
      const res = await fetch(`${baseUrl}/api/cli/auth/start`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        vscode.window.showErrorMessage(`Failed to start login: ${body.error ?? res.statusText}`);
        return false;
      }
      const data = (await res.json()) as { state: string; authUrl: string };
      state = data.state;
      authUrl = data.authUrl;
    } catch (err) {
      vscode.window.showErrorMessage(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }

    // Open browser
    await vscode.env.openExternal(vscode.Uri.parse(authUrl));

    // Poll for completion
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Waiting for browser authentication…", cancellable: true },
      async (_progress, token) => {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          if (token.isCancellationRequested) return null;
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          try {
            const res = await fetch(`${baseUrl}/api/cli/auth/poll?state=${encodeURIComponent(state)}`);
            if (!res.ok) continue;
            const data = (await res.json()) as { status: string; apiKey?: string; login?: string };
            if (data.status === "completed" && data.apiKey) {
              return data;
            }
            if (data.status === "expired") return null;
          } catch {
            // Network error — keep trying
          }
        }
        return null;
      }
    );

    if (!result?.apiKey) {
      vscode.window.showWarningMessage("Login timed out or was cancelled.");
      return false;
    }

    await this.secrets.store(SECRET_KEY, result.apiKey);
    this._onDidChangeAuth.fire(true);
    vscode.window.showInformationMessage(`Signed in to Remb${result.login ? ` as ${result.login}` : ""}!`);
    return true;
  }

  async logout(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
    this._onDidChangeAuth.fire(false);
    vscode.window.showInformationMessage("Signed out of Remb.");
  }

  /** Try to import API key from CLI credentials file (~/.config/remb/credentials).
   *  If force=true, re-imports even if a key already exists (used on auth failure). */
  async tryImportFromCli(force = false): Promise<boolean> {
    if (!force) {
      const existing = await this.getApiKey();
      if (existing) return true; // Already authenticated
    }

    const xdg = process.env.XDG_CONFIG_HOME;
    const base = xdg || resolve(homedir(), ".config");
    const credPath = resolve(base, "remb", "credentials");

    if (!existsSync(credPath)) return false;

    try {
      const raw = readFileSync(credPath, "utf-8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("api_key=")) {
          const key = trimmed.slice("api_key=".length).trim();
          if (key.startsWith("remb_")) {
            // Skip if CLI has the same key we already have
            const current = await this.getApiKey();
            if (current === key) return false;

            await this.secrets.store(SECRET_KEY, key);
            this._onDidChangeAuth.fire(true);
            return true;
          }
        }
      }
    } catch {
      // Can't read — skip
    }
    return false;
  }

  dispose() {
    this._onDidChangeAuth.dispose();
  }
}
