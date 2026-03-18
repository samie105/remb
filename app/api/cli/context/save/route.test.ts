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

import { POST } from "./route";

function createDbForSave(options?: {
  projectFound?: boolean;
  featureFound?: boolean;
}) {
  const projectFound = options?.projectFound ?? true;
  const featureFound = options?.featureFound ?? true;

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
              eq: () => ({
                single: async () => ({ data: featureFound ? { id: "feat_1" } : null }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "feat_new" }, error: null }),
            }),
          }),
        };
      }

      if (table === "context_entries") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: "entry_1", created_at: "2026-03-13T00:00:00.000Z" },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unhandled table in test stub: ${table}`);
    }),
  };
}

describe("POST /api/cli/context/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateCliRequestMock.mockResolvedValue({ user: { id: "user_1" } });
    createAdminClientMock.mockReturnValue(createDbForSave());
  });

  it("returns 400 for missing fields", async () => {
    const request = new Request("http://localhost/api/cli/context/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectSlug: "demo" }),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it("returns 201 for valid payload", async () => {
    const request = new Request("http://localhost/api/cli/context/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectSlug: "demo",
        featureName: "auth",
        content: "Added PKCE flow",
      }),
    });

    const res = await POST(request);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("entry_1");
  });
});
