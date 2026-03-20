import * as vscode from "vscode";
import type {
  Project,
  Memory,
  ContextEntry,
  ContextBundle,
  ScanResult,
  ScanStatus,
  SyncStatusResponse,
  ConversationEntry,
  McpServer,
} from "./types";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private baseUrl: string;

  private _onDidReceiveAuthError = new vscode.EventEmitter<void>();
  /** Fires when a 401 is received from the API, signaling the key is invalid/expired. */
  readonly onDidReceiveAuthError = this._onDidReceiveAuthError.event;

  private _onDidReceiveNetworkError = new vscode.EventEmitter<string>();
  /** Fires on network failures (connection refused, DNS, timeout, etc.). */
  readonly onDidReceiveNetworkError = this._onDidReceiveNetworkError.event;

  private _authErrorPrompted = false;
  private _lastLoginAt = 0;
  private _tryImportFromCli?: () => Promise<boolean>;

  constructor(private getApiKey: () => Promise<string | undefined>) {
    const config = vscode.workspace.getConfiguration("remb");
    this.baseUrl = (config.get<string>("apiUrl") ?? "https://www.useremb.com").replace(/\/+$/, "");
  }

  /** Set a callback to attempt CLI credential import on auth failure. */
  setCliImporter(fn: () => Promise<boolean>) {
    this._tryImportFromCli = fn;
  }

  /** Reset the "already prompted" guard so the next 401 will prompt again. */
  resetAuthPrompt() {
    this._authErrorPrompted = false;
  }

  /** Call after a successful login so the client knows to retry early 401s. */
  markLogin() {
    this._lastLoginAt = Date.now();
  }

  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_BACKOFF = [1000, 2000];

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    searchParams?: Record<string, string>
  ): Promise<T> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      this._onDidReceiveAuthError.fire();
      this.promptReAuth();
      throw new ApiError(401, "Not authenticated. Run \"Remb: Sign In\" first.");
    }

    let url = `${this.baseUrl}${path}`;
    if (searchParams) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(searchParams)) {
        if (v !== undefined && v !== null && v !== "") {
          params.set(k, v);
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "remb-vscode/0.1.0",
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const jsonBody = body ? JSON.stringify(body) : undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= ApiClient.MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: jsonBody,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;

        // Retry on network errors (but not abort timeout on last attempt)
        if (attempt < ApiClient.MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, ApiClient.RETRY_BACKOFF[attempt] ?? 2000));
          continue;
        }

        if (err instanceof DOMException && err.name === "AbortError") {
          this._onDidReceiveNetworkError.fire("Request timed out");
          throw new ApiError(0, "Request timed out. The server may be unresponsive.");
        }
        const msg = err instanceof Error ? err.message : String(err);
        this._onDidReceiveNetworkError.fire(msg);
        throw new ApiError(0, `Network error: ${msg}`);
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle 429 rate limiting — wait and retry
      if (res.status === 429 && attempt < ApiClient.MAX_RETRIES) {
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 || 5000 : 5000;
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 30_000)));
        continue;
      }

      // Retry on 5xx server errors
      if (res.status >= 500 && attempt < ApiClient.MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, ApiClient.RETRY_BACKOFF[attempt] ?? 2000));
        continue;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data as { error?: string })?.error ?? `HTTP ${res.status} ${res.statusText}`;
        if (res.status === 401) {
          // Grace period: if we just logged in, retry once after a short delay
          if (Date.now() - this._lastLoginAt < 10_000) {
            await new Promise((r) => setTimeout(r, 2_000));
            const freshKey = await this.getApiKey();
            const retryHeaders = { ...headers, Authorization: `Bearer ${freshKey}` };
            const retry = await fetch(url, { method, headers: retryHeaders, body: jsonBody });
            if (retry.ok) return (await retry.json().catch(() => null)) as T;
          }
          this._onDidReceiveAuthError.fire();
          this.promptReAuth();
        }
        throw new ApiError(res.status, msg, data);
      }
      return data as T;
    }

    throw lastError;
  }

  private async promptReAuth() {
    if (this._authErrorPrompted) return;
    this._authErrorPrompted = true;

    // Try to import a fresh key from CLI credentials before prompting the user
    if (this._tryImportFromCli) {
      const imported = await this._tryImportFromCli();
      if (imported) return; // CLI had a valid key — re-imported silently
    }

    try {
      const choice = await vscode.window.showWarningMessage(
        "Remb: Your session has expired or the API key is invalid.",
        "Sign In"
      );
      if (choice === "Sign In") {
        await vscode.commands.executeCommand("remb.login");
      }
    } catch {
      // User dismissed the prompt
    }
  }

  dispose() {
    this._onDidReceiveAuthError.dispose();
    this._onDidReceiveNetworkError.dispose();
  }

  // ── Context ──────────────────────────────────────────────

  async saveContext(params: {
    projectSlug: string;
    featureName: string;
    content: string;
    entryType?: string;
    tags?: string[];
  }) {
    return this.request<{ id: string; featureName: string; created_at: string }>(
      "POST",
      "/api/cli/context/save",
      params
    );
  }

  async getContext(params: {
    projectSlug: string;
    featureName?: string;
    limit?: number;
  }) {
    const search: Record<string, string> = { projectSlug: params.projectSlug };
    if (params.featureName) search.featureName = params.featureName;
    if (params.limit) search.limit = String(params.limit);
    return this.request<{ entries: ContextEntry[]; total: number }>(
      "GET",
      "/api/cli/context/get",
      undefined,
      search
    );
  }

  async bundleContext(projectSlug: string) {
    return this.request<ContextBundle>(
      "GET",
      "/api/cli/context/bundle",
      undefined,
      { projectSlug }
    );
  }

  async sessionStart(projectSlug: string) {
    return this.request<{
      project: { name: string; description: string | null; techStack: string[]; languages: Record<string, number> };
      memories: Array<{ tier: string; category: string; title: string; content: string }>;
      features: Array<{ name: string; category: string; importance: number; description: string | null; files: string[] }>;
      conversations: Array<{ content: string; type: string; tags: string[]; createdAt: string }>;
      lastScanAt: string | null;
      lastScannedSha: string | null;
    }>(
      "GET",
      "/api/cli/session/start",
      undefined,
      { projectSlug }
    );
  }

  // ── Memory ───────────────────────────────────────────────

  async listMemories(params?: {
    tier?: string;
    category?: string;
    project?: string;
    search?: string;
    limit?: number;
  }) {
    const search: Record<string, string> = {};
    if (params?.tier) search.tier = params.tier;
    if (params?.category) search.category = params.category;
    if (params?.project) search.project = params.project;
    if (params?.search) search.search = params.search;
    if (params?.limit) search.limit = String(params.limit);
    return this.request<{ memories: Memory[]; total: number }>(
      "GET",
      "/api/cli/memory",
      undefined,
      search
    );
  }

  async createMemory(params: {
    title: string;
    content: string;
    tier?: string;
    category?: string;
    tags?: string[];
    projectSlug?: string;
  }) {
    return this.request<{
      id: string;
      tier: string;
      category: string;
      title: string;
      token_count: number;
      created_at: string;
    }>("POST", "/api/cli/memory", params);
  }

  async updateMemory(
    id: string,
    params: { title?: string; content?: string; tier?: string; category?: string; tags?: string[] }
  ) {
    return this.request<{
      id: string;
      tier: string;
      category: string;
      title: string;
      token_count: number;
      updated_at: string;
    }>("PATCH", `/api/cli/memory/${encodeURIComponent(id)}`, params);
  }

  async deleteMemory(id: string) {
    return this.request<{ deleted: boolean }>(
      "DELETE",
      `/api/cli/memory/${encodeURIComponent(id)}`
    );
  }

  // ── Projects ─────────────────────────────────────────────

  async listProjects(params?: { status?: string; limit?: number }) {
    const search: Record<string, string> = {};
    if (params?.status) search.status = params.status;
    if (params?.limit) search.limit = String(params.limit);
    return this.request<{ projects: Project[]; total: number }>(
      "GET",
      "/api/cli/projects",
      undefined,
      search
    );
  }

  // ── Scan ─────────────────────────────────────────────────

  async triggerScan(projectSlug: string) {
    return this.request<ScanResult>("POST", "/api/cli/scan", { projectSlug });
  }

  async getScanStatus(scanId: string) {
    return this.request<ScanStatus>("GET", "/api/cli/scan", undefined, { scanId });
  }

  // ── Conversations ────────────────────────────────────────

  async getConversationHistory(params: {
    projectSlug?: string;
    limit?: number;
    format?: "json" | "markdown";
  } = {}) {
    const search: Record<string, string> = {};
    if (params.projectSlug) search.projectSlug = params.projectSlug;
    if (params.limit) search.limit = String(params.limit);
    if (params.format) search.format = params.format;
    return this.request<{ entries: ConversationEntry[]; total: number }>(
      "GET",
      "/api/cli/conversations",
      undefined,
      search
    );
  }

  async logConversation(params: {
    content: string;
    projectSlug?: string;
    type?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }) {
    return this.request<{ logged: boolean; id: string; created_at: string; deduplicated?: boolean }>(
      "POST",
      "/api/cli/conversations",
      params
    );
  }

  /**
   * Send raw IDE events to the server for AI summarization, embedding, and dedup.
   * This is the smart path — the server does the heavy lifting.
   */
  async logSmartConversation(params: {
    events: Array<{
      type: string;
      text?: string;
      path?: string;
      name?: string;
      timestamp?: number;
    }>;
    projectSlug?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.request<{ logged: boolean; id: string; created_at: string; deduplicated?: boolean; summary?: string }>(
      "POST",
      "/api/cli/conversations/smart",
      params
    );
  }

  // ── Sync Status ──────────────────────────────────────────

  async getSyncStatus(projectSlug: string) {
    return this.request<SyncStatusResponse>(
      "GET",
      "/api/cli/sync-status",
      undefined,
      { projectSlug }
    );
  }

  // ── MCP Servers ──────────────────────────────────────────

  async listMcpServers() {
    return this.request<{ servers: McpServer[] }>(
      "GET",
      "/api/cli/mcp-servers"
    );
  }

  async toggleMcpServer(serverId: string) {
    return this.request<{ id: string; name: string; isActive: boolean; message: string }>(
      "PATCH",
      "/api/cli/mcp-servers",
      { serverId }
    );
  }

  // ── Local Scan Upload ────────────────────────────────────

  async uploadLocalScan(params: {
    projectSlug: string;
    files: Array<{ path: string; content: string; sha?: string }>;
    batch: number;
    totalBatches: number;
    scanId?: string;
  }) {
    return this.request<{
      scanId: string;
      status: string;
      message: string;
      filesReceived: number;
    }>("POST", "/api/cli/scan/upload", params);
  }

  // ── File Context (for .remb/ mirror) ─────────────────────

  async getFileContextMap(projectSlug: string) {
    return this.request<{
      files: Record<string, Array<{
        feature: string;
        featureDescription: string | null;
        content: string;
        category: string;
        importance: number;
        entryType: string;
        tags: string[];
        updatedAt: string;
      }>>;
      dependencies: Record<string, { imports: string[]; importedBy: string[] }>;
    }>("GET", "/api/cli/context/files", undefined, { projectSlug });
  }
}
