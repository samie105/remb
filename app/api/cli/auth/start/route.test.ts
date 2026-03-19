import { describe, it, expect, vi, beforeEach } from "vitest";

const { createCliAuthSessionMock } = vi.hoisted(() => ({
  createCliAuthSessionMock: vi.fn(),
}));

vi.mock("@/lib/cli-oauth", () => ({
  createCliAuthSession: createCliAuthSessionMock,
}));

import { POST } from "./route";

describe("POST /api/cli/auth/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an auth session and returns authUrl", async () => {
    createCliAuthSessionMock.mockResolvedValue({ state: "abc123" });
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.state).toBe("abc123");
    expect(body.authUrl).toContain("state=abc123");
    expect(body.authUrl).toContain("https://app.example.com");
  });

  it("returns 500 when session creation fails", async () => {
    createCliAuthSessionMock.mockRejectedValue(new Error("DB down"));

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("DB down");
  });

  it("falls back to localhost URL when no env var", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    createCliAuthSessionMock.mockResolvedValue({ state: "xyz" });

    const res = await POST();
    const body = await res.json();

    expect(body.authUrl).toContain("http://localhost:3000");
  });
});
