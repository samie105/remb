import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionTracker } from "./session-tracker";

// Create mock dependencies
function createMockApi() {
  return {
    logConversation: vi.fn().mockResolvedValue({}),
  };
}

function createMockWorkspace(slug: string | null = "my-project") {
  const listeners: Array<(config: unknown) => void> = [];
  return {
    projectSlug: slug,
    onDidChangeProject: (fn: (config: unknown) => void) => {
      listeners.push(fn);
      return { dispose: () => {} };
    },
    _fireProjectChange: (config: unknown) => listeners.forEach((l) => l(config)),
  };
}

function createMockAuth(isAuth = true) {
  const listeners: Array<(isLoggedIn: boolean) => void> = [];
  return {
    isAuthenticated: vi.fn().mockResolvedValue(isAuth),
    onDidChangeAuth: (fn: (isLoggedIn: boolean) => void) => {
      listeners.push(fn);
      return { dispose: () => {} };
    },
    _fireAuthChange: (isLoggedIn: boolean) => listeners.forEach((l) => l(isLoggedIn)),
  };
}

describe("SessionTracker", () => {
  let api: ReturnType<typeof createMockApi>;
  let workspace: ReturnType<typeof createMockWorkspace>;
  let auth: ReturnType<typeof createMockAuth>;

  beforeEach(() => {
    api = createMockApi();
    workspace = createMockWorkspace();
    auth = createMockAuth(true);
  });

  it("logs session start when authenticated with project", async () => {
    const tracker = new SessionTracker(api as any, workspace as any, auth as any);
    await tracker.start();

    expect(api.logConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("IDE session started"),
        projectSlug: "my-project",
        type: "tool_call",
      })
    );
  });

  it("does NOT log session start when not authenticated", async () => {
    auth = createMockAuth(false);
    const tracker = new SessionTracker(api as any, workspace as any, auth as any);
    await tracker.start();

    expect(api.logConversation).not.toHaveBeenCalled();
  });

  it("does NOT log session start when no project slug", async () => {
    workspace = createMockWorkspace(null);
    const tracker = new SessionTracker(api as any, workspace as any, auth as any);
    await tracker.start();

    expect(api.logConversation).not.toHaveBeenCalled();
  });

  it("initializes on late auth (user signs in after activation)", async () => {
    auth = createMockAuth(false);
    const tracker = new SessionTracker(api as any, workspace as any, auth as any);
    await tracker.start();

    expect(api.logConversation).not.toHaveBeenCalled();

    // Now simulate the user signing in
    auth.isAuthenticated.mockResolvedValue(true);
    auth._fireAuthChange(true);
    await new Promise((r) => setTimeout(r, 50));

    expect(api.logConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("IDE session started"),
      })
    );
  });

  it("does not double-initialize on repeated auth changes", async () => {
    const tracker = new SessionTracker(api as any, workspace as any, auth as any);
    await tracker.start();

    const initialCallCount = api.logConversation.mock.calls.length;

    // Fire auth change again
    auth._fireAuthChange(true);
    await new Promise((r) => setTimeout(r, 50));

    // Should not have logged again (already started)
    expect(api.logConversation.mock.calls.length).toBe(initialCallCount);
  });

  it("logs session end with summary", async () => {
    const tracker = new SessionTracker(api as any, workspace as any, auth as any);
    await tracker.start();

    api.logConversation.mockClear();
    await tracker.end();

    expect(api.logConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("IDE session ended"),
        projectSlug: "my-project",
        type: "summary",
      })
    );
  });

  it("disposes without error", async () => {
    const tracker = new SessionTracker(api as any, workspace as any, auth as any);
    await tracker.start();
    expect(() => tracker.dispose()).not.toThrow();
  });
});
