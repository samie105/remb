import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncManager } from "./sync";

function createMockApi() {
  return {
    getSyncStatus: vi.fn(),
  };
}

function createMockWorkspace(slug: string | null = "test-proj") {
  const listeners: Array<(config: unknown) => void> = [];
  return {
    projectSlug: slug,
    onDidChangeProject: (fn: (config: unknown) => void) => {
      listeners.push(fn);
      return { dispose: () => {} };
    },
  };
}

function createMockAuth(isAuth = true) {
  return {
    isAuthenticated: vi.fn().mockResolvedValue(isAuth),
    onDidChangeAuth: (_fn: unknown) => ({ dispose: () => {} }),
  };
}

describe("SyncManager", () => {
  let api: ReturnType<typeof createMockApi>;
  let workspace: ReturnType<typeof createMockWorkspace>;
  let auth: ReturnType<typeof createMockAuth>;

  beforeEach(() => {
    api = createMockApi();
    workspace = createMockWorkspace();
    auth = createMockAuth();
  });

  it("returns 'unauthenticated' when not authed", async () => {
    auth = createMockAuth(false);
    const sync = new SyncManager(api as any, workspace as any, auth as any);
    const state = await sync.check();
    expect(state.kind).toBe("unauthenticated");
  });

  it("returns 'unknown' when no project slug", async () => {
    workspace = createMockWorkspace(null);
    const sync = new SyncManager(api as any, workspace as any, auth as any);
    const state = await sync.check();
    expect(state.kind).toBe("unknown");
  });

  it("returns 'synced' when API says synced", async () => {
    api.getSyncStatus.mockResolvedValue({
      hasRepo: true,
      synced: true,
      currentSha: "abc123",
      lastScanAt: "2026-01-01T00:00:00Z",
      lastScannedSha: "abc123",
      status: "idle",
    });

    const sync = new SyncManager(api as any, workspace as any, auth as any);
    const state = await sync.check();
    expect(state.kind).toBe("synced");
    if (state.kind === "synced") {
      expect(state.sha).toBe("abc123");
    }
  });

  it("returns 'behind' when SHAs differ", async () => {
    api.getSyncStatus.mockResolvedValue({
      hasRepo: true,
      synced: false,
      currentSha: "new123",
      lastScannedSha: "old456",
      lastScanAt: "2026-01-01T00:00:00Z",
      status: "idle",
    });

    const sync = new SyncManager(api as any, workspace as any, auth as any);
    const state = await sync.check();
    expect(state.kind).toBe("behind");
  });

  it("returns 'never-scanned' when no previous scan", async () => {
    api.getSyncStatus.mockResolvedValue({
      hasRepo: true,
      synced: false,
      currentSha: "abc123",
      lastScannedSha: null,
      lastScanAt: null,
      status: "idle",
    });

    const sync = new SyncManager(api as any, workspace as any, auth as any);
    const state = await sync.check();
    expect(state.kind).toBe("never-scanned");
  });

  it("returns 'scanning' when scan in progress", async () => {
    api.getSyncStatus.mockResolvedValue({
      hasRepo: true,
      synced: false,
      currentSha: "abc123",
      lastScannedSha: "old",
      lastScanAt: null,
      status: "scanning",
    });

    const sync = new SyncManager(api as any, workspace as any, auth as any);
    const state = await sync.check();
    expect(state.kind).toBe("scanning");
  });

  it("returns 'no-repo' when no repo linked", async () => {
    api.getSyncStatus.mockResolvedValue({
      hasRepo: false,
      synced: false,
      currentSha: null,
      lastScannedSha: null,
      lastScanAt: null,
      status: "idle",
    });

    const sync = new SyncManager(api as any, workspace as any, auth as any);
    const state = await sync.check();
    expect(state.kind).toBe("no-repo");
  });

  it("returns 'unknown' on API error", async () => {
    api.getSyncStatus.mockRejectedValue(new Error("Network error"));

    const sync = new SyncManager(api as any, workspace as any, auth as any);
    const state = await sync.check();
    expect(state.kind).toBe("unknown");
  });

  it("fires onDidChangeSyncState on state changes", async () => {
    api.getSyncStatus.mockResolvedValue({
      hasRepo: true,
      synced: true,
      currentSha: "abc",
      lastScanAt: "2026-01-01",
      lastScannedSha: "abc",
      status: "idle",
    });

    const sync = new SyncManager(api as any, workspace as any, auth as any);
    const stateChanges: unknown[] = [];
    sync.onDidChangeSyncState((s) => stateChanges.push(s));

    await sync.check();
    expect(stateChanges).toHaveLength(1);
    expect((stateChanges[0] as { kind: string }).kind).toBe("synced");
  });

  it("disposes timer and emitters cleanly", async () => {
    const sync = new SyncManager(api as any, workspace as any, auth as any);
    sync.start();
    expect(() => sync.dispose()).not.toThrow();
  });
});
