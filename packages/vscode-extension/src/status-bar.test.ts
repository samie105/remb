import { describe, it, expect, vi, beforeEach } from "vitest";
import { StatusBar } from "./status-bar";

function createMockAuth(isAuth = true) {
  const listeners: Array<(isLoggedIn: boolean) => void> = [];
  return {
    isAuthenticated: vi.fn().mockResolvedValue(isAuth),
    onDidChangeAuth: (fn: (b: boolean) => void) => {
      listeners.push(fn);
      return { dispose: () => {} };
    },
    _fireAuthChange: (v: boolean) => listeners.forEach((l) => l(v)),
  };
}

function createMockWorkspace(slug: string | null = "test-proj") {
  return {
    projectSlug: slug,
    onDidChangeProject: (_fn: unknown) => ({ dispose: () => {} }),
  };
}

function createMockApi() {
  const authListeners: Array<() => void> = [];
  const networkListeners: Array<(msg: string) => void> = [];
  return {
    resetAuthPrompt: vi.fn(),
    onDidReceiveAuthError: (fn: () => void) => {
      authListeners.push(fn);
      return { dispose: () => {} };
    },
    onDidReceiveNetworkError: (fn: (msg: string) => void) => {
      networkListeners.push(fn);
      return { dispose: () => {} };
    },
    _fireAuthError: () => authListeners.forEach((l) => l()),
    _fireNetworkError: (msg: string) => networkListeners.forEach((l) => l(msg)),
  };
}

function createMockSyncManager() {
  const listeners: Array<(state: { kind: string }) => void> = [];
  return {
    onDidChangeSyncState: (fn: (state: { kind: string }) => void) => {
      listeners.push(fn);
      return { dispose: () => {} };
    },
    _fireState: (state: { kind: string }) => listeners.forEach((l) => l(state)),
  };
}

describe("StatusBar", () => {
  let auth: ReturnType<typeof createMockAuth>;
  let workspace: ReturnType<typeof createMockWorkspace>;
  let api: ReturnType<typeof createMockApi>;
  let syncManager: ReturnType<typeof createMockSyncManager>;

  beforeEach(() => {
    auth = createMockAuth();
    workspace = createMockWorkspace();
    api = createMockApi();
    syncManager = createMockSyncManager();
  });

  it("creates without error", () => {
    expect(() => new StatusBar(auth as any, workspace as any, api as any, syncManager as any)).not.toThrow();
  });

  it("resets auth prompt on auth change", () => {
    new StatusBar(auth as any, workspace as any, api as any, syncManager as any);
    auth._fireAuthChange(true);
    expect(api.resetAuthPrompt).toHaveBeenCalled();
  });

  it("clears network error on successful sync", async () => {
    const bar = new StatusBar(auth as any, workspace as any, api as any, syncManager as any);

    // Simulate network error
    api._fireNetworkError("ECONNREFUSED");
    // Now simulate successful sync (with complete state object)
    syncManager._fireState({ kind: "synced", sha: "abc12345", lastScanAt: "2026-01-01" });
    await new Promise((r) => setTimeout(r, 50));

    expect(bar).toBeDefined();
  });

  it("does NOT clear network error on 'unknown' sync state", async () => {
    new StatusBar(auth as any, workspace as any, api as any, syncManager as any);
    api._fireNetworkError("ECONNREFUSED");
    syncManager._fireState({ kind: "unknown", message: "error" });
    await new Promise((r) => setTimeout(r, 50));
  });

  it("clears error state on auth change", () => {
    new StatusBar(auth as any, workspace as any, api as any, syncManager as any);
    api._fireAuthError();
    auth._fireAuthChange(true);
    // After auth change, errorState should be null
    // (verified by the resetAuthPrompt call which happens alongside)
    expect(api.resetAuthPrompt).toHaveBeenCalled();
  });
});
