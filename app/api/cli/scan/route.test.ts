import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  authenticateCliRequestMock,
  createAdminClientMock,
  getLatestCommitShaMock,
} = vi.hoisted(() => ({
  authenticateCliRequestMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  getLatestCommitShaMock: vi.fn(),
}));

vi.mock("@/lib/cli-auth", () => ({
  authenticateCliRequest: authenticateCliRequestMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/github-reader", () => ({
  getLatestCommitSha: getLatestCommitShaMock,
}));

vi.mock("@/lib/scan-dispatch", () => ({
  dispatchScan: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "./route";

// ── Helpers ───────────────────────────────────────────────

function createScanDb(opts: {
  project?: { id: string; name: string; repo_name: string | null; branch: string } | null;
  runningScans?: unknown[];
  githubToken?: string | null;
  lastScanSha?: string | null;
  scanJob?: { id: string; status: string; result: Record<string, unknown>; started_at: string; finished_at: string | null; project_id: string } | null;
  jobInsertError?: boolean;
} = {}) {
  const {
    project = { id: "proj_1", name: "Test", repo_name: "user/repo", branch: "main" },
    runningScans = [],
    githubToken = "ghp_123",
    lastScanSha = null,
    scanJob = null,
    jobInsertError = false,
  } = opts;

  return {
    from: vi.fn((table: string) => {
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: project }),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === "scan_jobs") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(() => {
            // Return object with both promise resolution AND .single() for chained calls
            const result = Promise.resolve({ data: runningScans, error: null });
            (result as unknown as Record<string, unknown>).single = vi.fn().mockResolvedValue({
              data: lastScanSha
                ? { result: { commit_sha: lastScanSha } }
                : null,
            });
            return result;
          }),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            if (scanJob) {
              return Promise.resolve({ data: scanJob });
            }
            return Promise.resolve({
              data: lastScanSha
                ? { result: { commit_sha: lastScanSha } }
                : null,
            });
          }),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(
                jobInsertError
                  ? { data: null, error: { message: "insert fail" } }
                  : { data: { id: "scan_1" }, error: null }
              ),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: githubToken ? { github_token: githubToken } : null,
          }),
        };
      }
      return {};
    }),
  };
}

// ── GET Tests ─────────────────────────────────────────────

describe("GET /api/cli/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns 400 when scanId missing", async () => {
    const req = new Request("http://localhost/api/cli/scan");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown scan job", async () => {
    const db = createScanDb();
    db.from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    }));
    createAdminClientMock.mockReturnValue(db);

    const req = new Request("http://localhost/api/cli/scan?scanId=nope");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns scan progress for a valid scan", async () => {
    const scanJob = {
      id: "scan_1",
      status: "running",
      result: { files_total: 50, files_scanned: 25, logs: [] },
      started_at: "2026-01-01T00:00:00Z",
      finished_at: null,
      project_id: "proj_1",
    };
    const db = {
      from: vi.fn((table: string) => {
        if (table === "scan_jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: scanJob }),
          };
        }
        if (table === "projects") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: "proj_1" } }),
          };
        }
        return {};
      }),
    };
    createAdminClientMock.mockReturnValue(db);

    const req = new Request("http://localhost/api/cli/scan?scanId=scan_1");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.percentage).toBe(50);
    expect(body.status).toBe("running");
  });
});

// ── POST Tests ────────────────────────────────────────────

describe("POST /api/cli/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
    getLatestCommitShaMock.mockResolvedValue("abc123");
    // Prevent actual fetch for fire-and-forget
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("returns 400 for missing projectSlug", async () => {
    const req = new Request("http://localhost/api/cli/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown project", async () => {
    createAdminClientMock.mockReturnValue(createScanDb({ project: null }));

    const req = new Request("http://localhost/api/cli/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectSlug: "nope" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 for project without repo", async () => {
    createAdminClientMock.mockReturnValue(
      createScanDb({ project: { id: "p1", name: "Test", repo_name: null, branch: "main" } })
    );

    const req = new Request("http://localhost/api/cli/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectSlug: "no-repo" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns already_running when scan in progress", async () => {
    createAdminClientMock.mockReturnValue(
      createScanDb({ runningScans: [{ id: "scan_old", status: "running" }] })
    );

    const req = new Request("http://localhost/api/cli/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectSlug: "my-proj" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.status).toBe("already_running");
  });

  it("returns up_to_date when SHA matches", async () => {
    getLatestCommitShaMock.mockResolvedValue("same_sha");
    createAdminClientMock.mockReturnValue(createScanDb({ lastScanSha: "same_sha" }));

    const req = new Request("http://localhost/api/cli/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectSlug: "my-proj" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.status).toBe("up_to_date");
  });

  it("starts scan successfully", async () => {
    // Set required env vars so the route doesn't fail on validation
    process.env.SCAN_WORKER_SECRET = "test-secret";
    process.env.OPENAI_API_KEY = "test-key";

    createAdminClientMock.mockReturnValue(createScanDb());

    const req = new Request("http://localhost/api/cli/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectSlug: "my-proj" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.status).toBe("started");
    expect(body.scanId).toBe("scan_1");

    delete process.env.SCAN_WORKER_SECRET;
    delete process.env.OPENAI_API_KEY;
  });
});
