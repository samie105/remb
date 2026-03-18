import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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

import { GET } from "./route";

function createDbForGet(options?: { projectFound?: boolean }) {
  const projectFound = options?.projectFound ?? true;

  return {
    from: vi.fn((table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: projectFound ? { id: "proj_1" } : null }),
              }),
            }),
          }),
        };
      }

      if (table === "features") {
        return {
          select: () => ({
            eq: () => ({
              data: [{ id: "feat_1" }],
            }),
            in: async () => ({ data: [{ id: "feat_1", name: "auth" }] }),
          }),
        };
      }

      if (table === "context_entries") {
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                limit: async () => ({
                  data: [
                    {
                      id: "entry_1",
                      feature_id: "feat_1",
                      content: "Added PKCE",
                      entry_type: "manual",
                      source: "cli",
                      metadata: {},
                      created_at: "2026-03-13T00:00:00.000Z",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unhandled table in test stub: ${table}`);
    }),
  };
}

describe("GET /api/cli/context/get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
    createAdminClientMock.mockReturnValue(createDbForGet());
  });

  it("returns 400 when projectSlug is missing", async () => {
    const request = new NextRequest("http://localhost/api/cli/context/get");
    const res = await GET(request);
    expect(res.status).toBe(400);
  });

  it("returns entries for valid request", async () => {
    const request = new NextRequest(
      "http://localhost/api/cli/context/get?projectSlug=demo&limit=5"
    );
    const res = await GET(request);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.entries[0].source).toBe("cli");
  });
});
