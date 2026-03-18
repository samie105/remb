import { getApiKey } from "./credentials.js";
import { findProjectConfig } from "./config.js";

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

export interface ClientOptions {
  apiUrl?: string;
  apiKey?: string;
}

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_BACKOFF = [1000, 2000, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createApiClient(opts: ClientOptions = {}) {
  const apiKey = opts.apiKey ?? getApiKey();
  if (!apiKey) {
    throw new Error(
      "No API key found. Run `remb login` or set REMB_API_KEY."
    );
  }

  const projectConfig = findProjectConfig();
  const baseUrl = (
    opts.apiUrl ??
    projectConfig?.config.api_url ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");

  async function request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    searchParams?: Record<string, string>
  ): Promise<T> {
    let url = `${baseUrl}${path}`;

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
      "User-Agent": "remb-cli/0.1.0",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const jsonBody = body ? JSON.stringify(body) : undefined;

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          REQUEST_TIMEOUT_MS,
        );

        const res = await fetch(url, {
          method,
          headers,
          body: jsonBody,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // Handle 429 rate limiting — wait and retry once
        if (res.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = res.headers.get("Retry-After");
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000 || 5000
            : 5000;
          await sleep(Math.min(waitMs, 30_000));
          continue;
        }

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            (data as { error?: string })?.error ??
            `HTTP ${res.status} ${res.statusText}`;
          throw new ApiError(res.status, msg, data);
        }

        return data as T;
      } catch (err) {
        lastError = err;

        // Don't retry client errors (4xx) — they won't change
        if (err instanceof ApiError && err.statusCode < 500) {
          throw err;
        }

        // Retry on 5xx, network errors, and timeouts
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BACKOFF[attempt] ?? 4000);
          continue;
        }
      }
    }

    throw lastError;
  }

  return {
    /** POST /api/cli/context/save */
    saveContext(params: {
      projectSlug: string;
      featureName: string;
      content: string;
      entryType?: string;
      tags?: string[];
    }) {
      return request<{ id: string; featureName: string; created_at: string }>(
        "POST",
        "/api/cli/context/save",
        params
      );
    },

    /** GET /api/cli/context/get */
    getContext(params: {
      projectSlug: string;
      featureName?: string;
      limit?: number;
    }) {
      const searchParams: Record<string, string> = {
        projectSlug: params.projectSlug,
      };
      if (params.featureName) searchParams.featureName = params.featureName;
      if (params.limit) searchParams.limit = String(params.limit);

      return request<{
        entries: Array<{
          id: string;
          feature: string;
          content: string;
          entry_type: string;
          source: string;
          metadata: unknown;
          created_at: string;
        }>;
        total: number;
      }>("GET", "/api/cli/context/get", undefined, searchParams);
    },

    /** POST /api/cli/context/save — batch variant for scan results */
    saveBatch(
      projectSlug: string,
      entries: Array<{
        featureName: string;
        content: string;
        entryType?: string;
        tags?: string[];
      }>,
      onProgress?: (saved: number, total: number) => void
    ) {
      const BATCH_SIZE = 5;
      const results: Array<{ id: string; featureName: string; created_at: string }> = [];

      const run = async () => {
        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
          const chunk = entries.slice(i, i + BATCH_SIZE);
          const chunkResults = await Promise.all(
            chunk.map((entry) =>
              request<{ id: string; featureName: string; created_at: string }>(
                "POST",
                "/api/cli/context/save",
                { projectSlug, ...entry }
              )
            )
          );
          results.push(...chunkResults);
          onProgress?.(results.length, entries.length);
        }
        return results;
      };

      return run();
    },

    /** Raw request for future endpoints */
    request,

    /** GET /api/cli/context/bundle — full project context for agents */
    bundleContext(projectSlug: string) {
      return request<{
        project: {
          name: string;
          description: string | null;
          techStack: string[];
          languages: Record<string, number>;
        };
        memories: Array<{
          tier: string;
          category: string;
          title: string;
          content: string;
        }>;
        features: Array<{
          name: string;
          category: string;
          importance: number;
          description: string | null;
          files: string[];
        }>;
        markdown: string;
      }>("GET", "/api/cli/context/bundle", undefined, { projectSlug });
    },

    /** POST /api/cli/context/diff — analyze local git diff */
    saveDiff(params: { projectSlug: string; diff: string }) {
      return request<{
        analyzed: number;
        changes: Array<{
          feature_name: string;
          summary: string;
          category: string;
          importance: number;
          files_changed: string[];
        }>;
      }>("POST", "/api/cli/context/diff", params);
    },

    /** GET /api/cli/memory */
    listMemories(params?: {
      tier?: string;
      category?: string;
      project?: string;
      search?: string;
      limit?: number;
    }) {
      const searchParams: Record<string, string> = {};
      if (params?.tier) searchParams.tier = params.tier;
      if (params?.category) searchParams.category = params.category;
      if (params?.project) searchParams.project = params.project;
      if (params?.search) searchParams.search = params.search;
      if (params?.limit) searchParams.limit = String(params.limit);

      return request<{
        memories: Array<{
          id: string;
          project_id: string | null;
          tier: string;
          category: string;
          title: string;
          content: string;
          tags: string[];
          token_count: number;
          access_count: number;
          created_at: string;
          updated_at: string;
        }>;
        total: number;
      }>("GET", "/api/cli/memory", undefined, searchParams);
    },

    /** POST /api/cli/memory */
    createMemory(params: {
      title: string;
      content: string;
      tier?: string;
      category?: string;
      tags?: string[];
      projectSlug?: string;
    }) {
      return request<{
        id: string;
        tier: string;
        category: string;
        title: string;
        token_count: number;
        created_at: string;
      }>("POST", "/api/cli/memory", params);
    },

    /** PATCH /api/cli/memory/:id */
    updateMemory(
      id: string,
      params: {
        title?: string;
        content?: string;
        tier?: string;
        category?: string;
        tags?: string[];
      }
    ) {
      return request<{
        id: string;
        tier: string;
        category: string;
        title: string;
        token_count: number;
        updated_at: string;
      }>("PATCH", `/api/cli/memory/${id}`, params);
    },

    /** DELETE /api/cli/memory/:id */
    deleteMemory(id: string) {
      return request<{ deleted: boolean }>(
        "DELETE",
        `/api/cli/memory/${id}`
      );
    },

    /** GET /api/cli/projects */
    listProjects(params?: {
      status?: string;
      limit?: number;
    }) {
      const searchParams: Record<string, string> = {};
      if (params?.status) searchParams.status = params.status;
      if (params?.limit) searchParams.limit = String(params.limit);

      return request<{
        projects: Array<{
          id: string;
          name: string;
          slug: string;
          description: string | null;
          repo_url: string | null;
          repo_name: string | null;
          language: string | null;
          branch: string;
          status: string;
          feature_count: number;
          entry_count: number;
          created_at: string;
          updated_at: string;
        }>;
        total: number;
      }>("GET", "/api/cli/projects", undefined, searchParams);
    },

    /** POST /api/cli/projects — create/register a project */
    createProject(params: {
      name: string;
      description?: string;
      repoUrl?: string;
      repoName?: string;
      language?: string;
      branch?: string;
    }) {
      return request<{
        project: { id: string; name: string; slug: string; status: string };
        created: boolean;
      }>("POST", "/api/cli/projects", params);
    },

    /** POST /api/cli/scan — trigger a server-side scan */
    triggerScan(projectSlug: string) {
      return request<{
        scanId: string | null;
        status: "started" | "already_running" | "up_to_date";
        message: string;
        currentSha?: string;
      }>("POST", "/api/cli/scan", { projectSlug });
    },

    /** GET /api/cli/scan?scanId=<id> — poll scan progress */
    getScanStatus(scanId: string) {
      return request<{
        scanId: string;
        status: "queued" | "running" | "done" | "failed";
        filesTotal: number;
        filesScanned: number;
        percentage: number;
        logs: Array<{
          timestamp: string;
          file: string;
          status: "scanning" | "done" | "skipped" | "error";
          feature?: string;
          message?: string;
        }>;
        featuresCreated: number;
        errors: number;
        durationMs: number;
        startedAt: string | null;
        finishedAt: string | null;
      }>("GET", "/api/cli/scan", undefined, { scanId });
    },

    /** GET /api/cli/conversations — fetch conversation history */
    getConversationHistory(params: {
      projectSlug?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      format?: "json" | "markdown";
    } = {}) {
      const search: Record<string, string> = {};
      if (params.projectSlug) search.projectSlug = params.projectSlug;
      if (params.startDate) search.startDate = params.startDate;
      if (params.endDate) search.endDate = params.endDate;
      if (params.limit) search.limit = String(params.limit);
      if (params.format) search.format = params.format;
      return request<{
        entries: Array<{
          id: string;
          project_id: string | null;
          session_id: string;
          type: string;
          content: string;
          metadata: Record<string, unknown>;
          source: string;
          created_at: string;
        }>;
        total: number;
      }>("GET", "/api/cli/conversations", undefined, search);
    },

    /** POST /api/cli/conversations — log a conversation entry */
    logConversation(params: {
      content: string;
      projectSlug?: string;
      type?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
      sessionId?: string;
    }) {
      return request<{
        logged: boolean;
        id: string;
        created_at: string;
        deduplicated?: boolean;
      }>("POST", "/api/cli/conversations", params);
    },

    /** GET /api/cli/conversations/search — semantic search conversation history */
    searchConversations(params: {
      query: string;
      projectSlug?: string;
      tags?: string[];
      limit?: number;
    }) {
      const search: Record<string, string> = { q: params.query };
      if (params.projectSlug) search.projectSlug = params.projectSlug;
      if (params.tags?.length) search.tags = params.tags.join(",");
      if (params.limit) search.limit = String(params.limit);
      return request<{
        results: Array<{
          id: string;
          content: string;
          type: string;
          source: string;
          tags: string[] | null;
          project_slug: string | null;
          similarity: number;
          created_at: string;
        }>;
      }>("GET", "/api/cli/conversations/search", undefined, search);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
