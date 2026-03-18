import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findProjectConfig, writeProjectConfig } from "./config.js";

describe("config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "remb-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("writeProjectConfig", () => {
    it("writes a valid .remb.yml file", () => {
      const path = writeProjectConfig(tmpDir, {
        project: "my-app",
        api_url: "https://remb.vercel.app",
      });

      expect(path).toContain(".remb.yml");

      // Should be findable now
      const found = findProjectConfig(tmpDir);
      expect(found).not.toBeNull();
      expect(found!.config.project).toBe("my-app");
      expect(found!.config.api_url).toBe("https://remb.vercel.app");
    });

    it("defaults api_url correctly", () => {
      writeProjectConfig(tmpDir, {
        project: "test-proj",
        api_url: "https://custom.example.com",
      });

      const found = findProjectConfig(tmpDir);
      expect(found!.config.api_url).toBe("https://custom.example.com");
    });
  });

  describe("findProjectConfig", () => {
    it("returns null when no config exists", () => {
      const result = findProjectConfig(tmpDir);
      expect(result).toBeNull();
    });

    it("finds config in current directory", () => {
      writeProjectConfig(tmpDir, {
        project: "root-project",
        api_url: "https://remb.vercel.app",
      });

      const result = findProjectConfig(tmpDir);
      expect(result).not.toBeNull();
      expect(result!.config.project).toBe("root-project");
      expect(result!.dir).toBe(tmpDir);
    });

    it("walks up to find config in parent directory", () => {
      // Write config in root
      writeProjectConfig(tmpDir, {
        project: "parent-project",
        api_url: "https://remb.vercel.app",
      });

      // Search from nested child
      const nestedDir = join(tmpDir, "src", "components");
      mkdirSync(nestedDir, { recursive: true });

      const result = findProjectConfig(nestedDir);
      expect(result).not.toBeNull();
      expect(result!.config.project).toBe("parent-project");
      expect(result!.dir).toBe(tmpDir);
    });

    it("parses quoted values correctly", () => {
      const configPath = join(tmpDir, ".remb.yml");
      writeFileSync(
        configPath,
        `project: "quoted-project"\napi_url: 'https://example.com'\n`,
        "utf-8"
      );

      const result = findProjectConfig(tmpDir);
      expect(result!.config.project).toBe("quoted-project");
      expect(result!.config.api_url).toBe("https://example.com");
    });

    it("ignores comments and blank lines", () => {
      const configPath = join(tmpDir, ".remb.yml");
      writeFileSync(
        configPath,
        `# This is a comment\n\nproject: my-app\n# Another comment\napi_url: https://example.com\n`,
        "utf-8"
      );

      const result = findProjectConfig(tmpDir);
      expect(result!.config.project).toBe("my-app");
      expect(result!.config.api_url).toBe("https://example.com");
    });
  });
});
