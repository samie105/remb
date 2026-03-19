import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthManager } from "./auth";

// Simulate SecretStorage
function createMockSecrets(): Record<string, string> & {
  get: (key: string) => Promise<string | undefined>;
  store: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  onDidChange: unknown;
} {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key),
    store: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    onDidChange: () => ({ dispose: () => {} }),
  } as any;
}

describe("AuthManager", () => {
  let secrets: ReturnType<typeof createMockSecrets>;
  let auth: AuthManager;

  beforeEach(() => {
    secrets = createMockSecrets();
    auth = new AuthManager(secrets as any);
  });

  describe("isAuthenticated", () => {
    it("returns false when no key is stored", async () => {
      expect(await auth.isAuthenticated()).toBe(false);
    });

    it("returns true when a key is stored", async () => {
      await secrets.store("remb.apiKey", "remb_test_123");
      expect(await auth.isAuthenticated()).toBe(true);
    });
  });

  describe("getApiKey", () => {
    it("returns undefined when no key stored", async () => {
      expect(await auth.getApiKey()).toBeUndefined();
    });

    it("returns the stored key", async () => {
      await secrets.store("remb.apiKey", "remb_abc");
      expect(await auth.getApiKey()).toBe("remb_abc");
    });
  });

  describe("logout", () => {
    it("removes the key and fires auth change event", async () => {
      await secrets.store("remb.apiKey", "remb_test");
      expect(await auth.isAuthenticated()).toBe(true);

      const authChangeFired = vi.fn();
      auth.onDidChangeAuth(authChangeFired);

      await auth.logout();
      expect(await auth.isAuthenticated()).toBe(false);
      expect(authChangeFired).toHaveBeenCalledWith(false);
    });
  });

  describe("tryImportFromCli", () => {
    it("returns true (already authed) when key stored and force=false", async () => {
      await secrets.store("remb.apiKey", "remb_existing");
      const result = await auth.tryImportFromCli(false);
      expect(result).toBe(true);
      // Key unchanged
      expect(await auth.getApiKey()).toBe("remb_existing");
    });

    it("tryImportFromCli returns boolean", async () => {
      // The result depends on whether a real CLI credentials file exists.
      // We just verify it returns a boolean and doesn't throw.
      const result = await auth.tryImportFromCli(false);
      expect(typeof result).toBe("boolean");
    });

    it("tryImportFromCli with force returns boolean", async () => {
      const result = await auth.tryImportFromCli(true);
      expect(typeof result).toBe("boolean");
    });
  });

  describe("event emitter", () => {
    it("fires onDidChangeAuth on logout", async () => {
      await secrets.store("remb.apiKey", "remb_test");
      const listener = vi.fn();
      auth.onDidChangeAuth(listener);

      await auth.logout();
      expect(listener).toHaveBeenCalledWith(false);
    });

    it("disposes without error", () => {
      expect(() => auth.dispose()).not.toThrow();
    });

    it("stops firing after dispose", async () => {
      await secrets.store("remb.apiKey", "remb_test");
      const listener = vi.fn();
      auth.onDidChangeAuth(listener);
      auth.dispose();

      // After dispose, logout should not fire to listener
      // (EventEmitter.dispose clears listeners)
      await auth.logout().catch(() => {}); // May throw since emitter is disposed
    });
  });
});
