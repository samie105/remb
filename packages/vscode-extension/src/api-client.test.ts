import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiError } from "./api-client";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createClient(apiKey: string | undefined = "remb_test_key") {
  return new ApiClient(() => Promise.resolve(apiKey));
}

describe("ApiClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("request basics", () => {
    it("throws ApiError(401) if no API key is available", async () => {
      const client = createClient(undefined);
      // Provide a proper mock response so if fetch IS called, it won't crash
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "unauthorized" }),
      });
      let caught: unknown;
      try {
        await client.listProjects({});
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).statusCode).toBe(401);
    });

    it("sends Authorization header with the API key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ projects: [] }),
      });

      const client = createClient("remb_my_key");
      await client.listProjects({});

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers.Authorization).toBe("Bearer remb_my_key");
    });

    it("fires auth error event on 401 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Invalid key" }),
      });

      const client = createClient();
      const authErrorFired = vi.fn();
      client.onDidReceiveAuthError(authErrorFired);

      await expect(client.listProjects({})).rejects.toThrow();
      expect(authErrorFired).toHaveBeenCalledOnce();
    });

    it("fires network error event on fetch failure", async () => {
      // Must reject all retry attempts (initial + MAX_RETRIES)
      mockFetch
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const client = createClient();
      const networkErrorFired = vi.fn();
      client.onDidReceiveNetworkError(networkErrorFired);

      await expect(client.listProjects({})).rejects.toThrow();
      expect(networkErrorFired).toHaveBeenCalledWith("ECONNREFUSED");
    });

    it("includes search params in URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ projects: [] }),
      });

      const client = createClient();
      await client.listProjects({ status: "active" });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("status=active");
    });
  });

  describe("401 retry with fresh key", () => {
    it("retries with a fresh API key after recent login", async () => {
      // getApiKey is called:
      //   1st time in request() for initial headers
      //   2nd time for the retry re-fetch
      let callCount = 0;
      const keyGetter = async () => {
        callCount++;
        return callCount <= 1 ? "remb_old_key" : "remb_new_key";
      };

      const client = new ApiClient(keyGetter);
      client.markLogin(); // Mark as just logged in

      // First call returns 401
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: async () => ({ error: "Invalid key" }),
        })
        // Retry succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ projects: [{ id: "1" }] }),
        });

      const result = await client.listProjects({});
      expect(result).toEqual({ projects: [{ id: "1" }] });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify the retry used the fresh key (2nd getApiKey call)
      const [, retryOpts] = mockFetch.mock.calls[1];
      expect(retryOpts.headers.Authorization).toBe("Bearer remb_new_key");
    });

    it("does NOT retry if login was not recent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Invalid key" }),
      });

      const client = createClient();
      // Don't call markLogin() — no recent login

      await expect(client.listProjects({})).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retry
    });
  });

  describe("CLI importer on auth failure", () => {
    it("tries CLI import before showing prompt on 401", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Invalid key" }),
      });

      const cliImporter = vi.fn().mockResolvedValue(true);
      const client = createClient();
      client.setCliImporter(cliImporter);

      await expect(client.listProjects({})).rejects.toThrow(ApiError);
      // Give promptReAuth time to run (it's async fire-and-forget)
      await new Promise((r) => setTimeout(r, 50));
      expect(cliImporter).toHaveBeenCalledOnce();
    });
  });

  describe("promptReAuth dedup", () => {
    it("only prompts once per auth failure cycle", async () => {
      const makeFailure = () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Invalid" }),
      });

      mockFetch
        .mockResolvedValueOnce(makeFailure())
        .mockResolvedValueOnce(makeFailure());

      const cliImporter = vi.fn().mockResolvedValue(false);
      const client = createClient();
      client.setCliImporter(cliImporter);

      await expect(client.listProjects({})).rejects.toThrow();
      await expect(client.listProjects({})).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 50));

      // CLI importer called only once (guard prevents second prompt)
      expect(cliImporter).toHaveBeenCalledOnce();
    });

    it("resets prompt guard on resetAuthPrompt()", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false, status: 401, statusText: "Unauthorized",
          json: async () => ({ error: "Invalid" }),
        })
        .mockResolvedValueOnce({
          ok: false, status: 401, statusText: "Unauthorized",
          json: async () => ({ error: "Invalid" }),
        });

      const cliImporter = vi.fn().mockResolvedValue(false);
      const client = createClient();
      client.setCliImporter(cliImporter);

      await expect(client.listProjects({})).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 50));
      expect(cliImporter).toHaveBeenCalledOnce();

      client.resetAuthPrompt();
      await expect(client.listProjects({})).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 50));
      expect(cliImporter).toHaveBeenCalledTimes(2);
    });
  });

  describe("timeout handling", () => {
    it("fires network error and throws on timeout", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      // Must reject all retry attempts (initial + MAX_RETRIES)
      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockRejectedValueOnce(abortError)
        .mockRejectedValueOnce(abortError);

      const client = createClient();
      const networkErrorFired = vi.fn();
      client.onDidReceiveNetworkError(networkErrorFired);

      await expect(client.listProjects({})).rejects.toMatchObject({ statusCode: 0 });
      expect(networkErrorFired).toHaveBeenCalledWith("Request timed out");
    });
  });

  describe("dispose", () => {
    it("disposes event emitters without error", () => {
      const client = createClient();
      expect(() => client.dispose()).not.toThrow();
    });
  });
});
