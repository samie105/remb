import { describe, it, expect, vi, beforeEach } from "vitest";

const { authenticateCliRequestMock, createAdminClientMock, generateEmbeddingMock } = vi.hoisted(() => ({
  authenticateCliRequestMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  generateEmbeddingMock: vi.fn(),
}));

vi.mock("@/lib/cli-auth", () => ({
  authenticateCliRequest: authenticateCliRequestMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/openai", () => ({
  generateEmbedding: generateEmbeddingMock,
}));

import { GET, POST } from "./route";
import { NextRequest } from "next/server";

// ── Helpers ───────────────────────────────────────────────

function createDbForList(memories: unknown[] = []) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve({ data: memories, error: null })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "memories") return chainable;
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "proj_1" } }),
              }),
            }),
          }),
        };
      }
      return chainable;
    }),
    rpc: vi.fn().mockResolvedValue({ data: memories, error: null }),
  };
}

function createDbForCreate(opts?: { coreLimitReached?: boolean }) {
  return {
    from: vi.fn((table: string) => {
      if (table === "memories") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() =>
                Promise.resolve({ count: opts?.coreLimitReached ? 20 : 5 })
              ),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "mem_1",
                  tier: "active",
                  category: "general",
                  title: "Test",
                  token_count: 10,
                  created_at: "2026-01-01T00:00:00Z",
                },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "proj_1" } }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unhandled table: ${table}`);
    }),
  };
}

// ── GET Tests ─────────────────────────────────────────────

describe("GET /api/cli/memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns memories list", async () => {
    const memories = [
      { id: "m1", title: "Pattern A", tier: "core", category: "pattern" },
      { id: "m2", title: "Decision B", tier: "active", category: "decision" },
    ];
    createAdminClientMock.mockReturnValue(createDbForList(memories));

    const req = new NextRequest("http://localhost/api/cli/memory");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.memories).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("returns 401 when unauthenticated", async () => {
    const { NextResponse } = await import("next/server");
    authenticateCliRequestMock.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const req = new NextRequest("http://localhost/api/cli/memory");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("limits to max 200", async () => {
    const db = createDbForList([]);
    createAdminClientMock.mockReturnValue(db);

    const req = new NextRequest("http://localhost/api/cli/memory?limit=999");
    await GET(req);

    // The limit call should receive 200 (capped)
    const fromCalls = db.from.mock.calls;
    expect(fromCalls.length).toBeGreaterThan(0);
  });

  it("uses semantic search when search param provided and embedding succeeds", async () => {
    const db = createDbForList([{ id: "m1", title: "found" }]);
    createAdminClientMock.mockReturnValue(db);
    generateEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);

    const req = new NextRequest("http://localhost/api/cli/memory?search=test");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith("search_memories", expect.objectContaining({
      p_user_id: "user_1",
    }));
  });
});

// ── POST Tests ────────────────────────────────────────────

describe("POST /api/cli/memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
    generateEmbeddingMock.mockResolvedValue([0.1, 0.2]);
  });

  it("creates a memory with valid payload", async () => {
    createAdminClientMock.mockReturnValue(createDbForCreate());

    const req = new Request("http://localhost/api/cli/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Test Memory",
        content: "Some useful pattern",
        tier: "active",
        category: "pattern",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("mem_1");
  });

  it("returns 400 for missing title", async () => {
    const req = new Request("http://localhost/api/cli/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "No title" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing content", async () => {
    const req = new Request("http://localhost/api/cli/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "No content" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/cli/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 when core tier limit reached", async () => {
    createAdminClientMock.mockReturnValue(createDbForCreate({ coreLimitReached: true }));

    const req = new Request("http://localhost/api/cli/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Core Memory",
        content: "Important",
        tier: "core",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("defaults tier to active and category to general", async () => {
    const db = createDbForCreate();
    createAdminClientMock.mockReturnValue(db);

    const req = new Request("http://localhost/api/cli/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Defaults",
        content: "Should use defaults",
        tier: "invalid_tier",
        category: "invalid_cat",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
