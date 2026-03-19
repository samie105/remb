import { describe, it, expect, vi, beforeEach } from "vitest";

const { authenticateCliRequestMock, createAdminClientMock } = vi.hoisted(() => ({
  authenticateCliRequestMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/cli-auth", () => ({
  authenticateCliRequest: authenticateCliRequestMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: createAdminClientMock,
}));

import { GET, POST } from "./route";
import { NextRequest } from "next/server";

// ── Helpers ───────────────────────────────────────────────

function createDbForProjects(projects: unknown[] = []) {
  return {
    from: vi.fn((table: string) => {
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: projects, error: null }),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "proj_new",
                  name: "New Project",
                  slug: "new-project",
                  status: "active",
                },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "features") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [] }),
        };
      }
      if (table === "context_entries") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [] }),
        };
      }
      return {};
    }),
  };
}

// ── GET Tests ─────────────────────────────────────────────

describe("GET /api/cli/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns projects list with counts", async () => {
    const projects = [
      { id: "p1", name: "Alpha", slug: "alpha", status: "active" },
      { id: "p2", name: "Beta", slug: "beta", status: "active" },
    ];
    createAdminClientMock.mockReturnValue(createDbForProjects(projects));

    const req = new NextRequest("http://localhost/api/cli/projects");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.projects).toHaveLength(2);
    expect(body.projects[0]).toHaveProperty("feature_count");
    expect(body.projects[0]).toHaveProperty("entry_count");
  });

  it("returns empty array when no projects", async () => {
    createAdminClientMock.mockReturnValue(createDbForProjects([]));

    const req = new NextRequest("http://localhost/api/cli/projects");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.projects).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const { NextResponse } = await import("next/server");
    authenticateCliRequestMock.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const req = new NextRequest("http://localhost/api/cli/projects");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ── POST Tests ────────────────────────────────────────────

describe("POST /api/cli/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("creates a project", async () => {
    createAdminClientMock.mockReturnValue(createDbForProjects());

    const req = new NextRequest("http://localhost/api/cli/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Project" }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.created).toBe(true);
    expect(body.project.slug).toBe("new-project");
  });

  it("returns 400 for missing name", async () => {
    const req = new NextRequest("http://localhost/api/cli/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate slug", async () => {
    const db = createDbForProjects();
    // Override project insert to return unique constraint error
    db.from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "23505", message: "duplicate key" },
          }),
        })),
      })),
    }));
    createAdminClientMock.mockReturnValue(db);

    const req = new NextRequest("http://localhost/api/cli/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Existing" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});
