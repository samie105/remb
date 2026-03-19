import { describe, it, expect, vi, beforeEach } from "vitest";

const { pollCliAuthSessionMock } = vi.hoisted(() => ({
  pollCliAuthSessionMock: vi.fn(),
}));

vi.mock("@/lib/cli-oauth", () => ({
  pollCliAuthSession: pollCliAuthSessionMock,
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

describe("GET /api/cli/auth/poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when state param missing", async () => {
    const req = new NextRequest("http://localhost/api/cli/auth/poll");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns pending status", async () => {
    pollCliAuthSessionMock.mockResolvedValue({ status: "pending" });

    const req = new NextRequest("http://localhost/api/cli/auth/poll?state=abc123");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("pending");
  });

  it("returns completed status with API key", async () => {
    pollCliAuthSessionMock.mockResolvedValue({
      status: "completed",
      apiKey: "remb_test_key",
      login: "testuser",
    });

    const req = new NextRequest("http://localhost/api/cli/auth/poll?state=abc123");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("completed");
    expect(body.apiKey).toBe("remb_test_key");
    expect(body.login).toBe("testuser");
  });

  it("returns expired status", async () => {
    pollCliAuthSessionMock.mockResolvedValue({ status: "expired" });

    const req = new NextRequest("http://localhost/api/cli/auth/poll?state=abc123");
    const res = await GET(req);
    const body = await res.json();

    expect(body.status).toBe("expired");
  });

  it("returns 500 if poll fails", async () => {
    pollCliAuthSessionMock.mockRejectedValue(new Error("Session not found"));

    const req = new NextRequest("http://localhost/api/cli/auth/poll?state=abc123");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Session not found");
  });
});
