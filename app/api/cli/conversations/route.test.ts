import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  authenticateCliRequestMock,
  createAdminClientMock,
  getConversationHistoryMock,
  generateConversationMarkdownMock,
  logConversationMock,
} = vi.hoisted(() => ({
  authenticateCliRequestMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  getConversationHistoryMock: vi.fn(),
  generateConversationMarkdownMock: vi.fn(),
  logConversationMock: vi.fn(),
}));

vi.mock("@/lib/cli-auth", () => ({
  authenticateCliRequest: authenticateCliRequestMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/conversation-actions", () => ({
  getConversationHistory: getConversationHistoryMock,
  generateConversationMarkdown: generateConversationMarkdownMock,
  logConversation: logConversationMock,
}));

import { GET, POST } from "./route";

// ── Helpers ───────────────────────────────────────────────

function createDbForProjectLookup(project: { id: string } | null = { id: "proj_1" }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project }),
    })),
  };
}

// ── GET Tests ─────────────────────────────────────────────

describe("GET /api/cli/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns JSON format by default", async () => {
    const entries = [
      { id: "c1", content: "Did X", type: "summary", created_at: "2026-01-01" },
    ];
    getConversationHistoryMock.mockResolvedValue(entries);

    const req = new Request("http://localhost/api/cli/conversations");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.entries).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("returns markdown when format=markdown", async () => {
    generateConversationMarkdownMock.mockResolvedValue("# History\n- Did X");

    const req = new Request("http://localhost/api/cli/conversations?format=markdown");
    const res = await GET(req);

    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("# History");
  });

  it("returns 404 for unknown projectSlug", async () => {
    createAdminClientMock.mockReturnValue(createDbForProjectLookup(null));

    const req = new Request("http://localhost/api/cli/conversations?projectSlug=nope");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("resolves projectSlug when provided", async () => {
    createAdminClientMock.mockReturnValue(createDbForProjectLookup({ id: "proj_1" }));
    getConversationHistoryMock.mockResolvedValue([]);

    const req = new Request("http://localhost/api/cli/conversations?projectSlug=my-proj");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getConversationHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj_1" })
    );
  });

  it("returns 401 for unauthenticated", async () => {
    const { NextResponse } = await import("next/server");
    authenticateCliRequestMock.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const req = new Request("http://localhost/api/cli/conversations");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ── POST Tests ────────────────────────────────────────────

describe("POST /api/cli/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("logs a conversation entry", async () => {
    logConversationMock.mockResolvedValue({
      id: "conv_1",
      created_at: "2026-01-01T00:00:00Z",
    });

    const req = new Request("http://localhost/api/cli/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Implemented feature X",
        type: "summary",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.logged).toBe(true);
    expect(body.id).toBe("conv_1");
  });

  it("returns 400 for missing content", async () => {
    const req = new Request("http://localhost/api/cli/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "summary" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("defaults invalid type to summary", async () => {
    logConversationMock.mockResolvedValue({
      id: "conv_2",
      created_at: "2026-01-01T00:00:00Z",
    });

    const req = new Request("http://localhost/api/cli/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Something",
        type: "invalid_type",
      }),
    });

    await POST(req);
    expect(logConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "summary" })
    );
  });

  it("resolves projectSlug to projectId for POST", async () => {
    createAdminClientMock.mockReturnValue(createDbForProjectLookup({ id: "proj_1" }));
    logConversationMock.mockResolvedValue({
      id: "conv_3",
      created_at: "2026-01-01T00:00:00Z",
    });

    const req = new Request("http://localhost/api/cli/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Work on project",
        projectSlug: "my-proj",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(logConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj_1" })
    );
  });

  it("returns 404 for unknown projectSlug in POST", async () => {
    createAdminClientMock.mockReturnValue(createDbForProjectLookup(null));

    const req = new Request("http://localhost/api/cli/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Work",
        projectSlug: "nope",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
