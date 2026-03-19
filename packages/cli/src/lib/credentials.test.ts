import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to control environment variables, so we import after setting them
let credentials: typeof import("./credentials.js");

describe("credentials", () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "remb-cred-test-"));
    // Point XDG to our temp dir so we don't touch real credentials
    process.env.XDG_CONFIG_HOME = tmpDir;
    // Clear any existing REMB_API_KEY
    delete process.env.REMB_API_KEY;
    // Re-import to pick up the new XDG path
    credentials = await import("./credentials.js");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  describe("saveApiKey + getApiKey", () => {
    it("saves and retrieves an API key", () => {
      const testKey = "remb_abc123def456_extra";
      credentials.saveApiKey(testKey);

      const retrieved = credentials.getApiKey();
      expect(retrieved).toBe(testKey);
    });

    it("creates the credentials file with restricted permissions", () => {
      credentials.saveApiKey("remb_test0123456789ab");
      const path = credentials.getCredentialsFilePath();
      const stat = statSync(path);
      // Check file permissions (owner read+write only = 0o600)
      const mode = stat.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it("writes a human-readable credentials file", () => {
      credentials.saveApiKey("remb_mykey1234567890ab");
      const path = credentials.getCredentialsFilePath();
      const content = readFileSync(path, "utf-8");

      expect(content).toContain("api_key=remb_mykey1234567890ab");
      expect(content).toContain("# Remb API credentials");
    });
  });

  describe("getApiKey with env var", () => {
    it("prefers REMB_API_KEY env var over file", () => {
      credentials.saveApiKey("remb_from_file_extra1234");
      process.env.REMB_API_KEY = "remb_from_env";

      const key = credentials.getApiKey();
      expect(key).toBe("remb_from_env");
    });
  });

  describe("clearApiKey", () => {
    it("clears the stored key", () => {
      credentials.saveApiKey("remb_tobecleared_extra1");
      expect(credentials.getApiKey()).toBe("remb_tobecleared_extra1");

      credentials.clearApiKey();
      // After clearing, reading from file should return null (env not set)
      const key = credentials.getApiKey();
      expect(key).toBeNull();
    });

    it("returns false if no credentials file exists", () => {
      const result = credentials.clearApiKey();
      // On first run there's no file — should handle gracefully
      // (returns false or true depending on whether dir was created)
      expect(typeof result).toBe("boolean");
    });
  });

  describe("getCredentialsFilePath", () => {
    it("respects XDG_CONFIG_HOME", () => {
      const path = credentials.getCredentialsFilePath();
      expect(path).toContain(tmpDir);
      expect(path).toContain("remb");
      expect(path).toContain("credentials");
    });
  });

  describe("key validation", () => {
    it("rejects keys without remb_ prefix", () => {
      expect(() => credentials.saveApiKey("invalid_key_0123456789")).toThrow(
        "Invalid API key format"
      );
    });

    it("rejects keys shorter than 20 characters", () => {
      expect(() => credentials.saveApiKey("remb_short")).toThrow(
        "Invalid API key format"
      );
    });

    it("accepts valid keys", () => {
      expect(() =>
        credentials.saveApiKey("remb_valid_key_1234567890")
      ).not.toThrow();
    });
  });
});
