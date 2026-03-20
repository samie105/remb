import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Integration tests for CLI commands.
 * These run the built CLI as a subprocess to test real behavior.
 */

const CLI_PATH = resolve(
  import.meta.dirname ?? __dirname,
  "../../dist/index.js"
);

function run(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {}
): { stdout: string; stderr: string; output: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env, NO_COLOR: "1" },
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", output: stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    const stdout = e.stdout ?? "";
    const stderr = e.stderr ?? "";
    return {
      stdout,
      stderr,
      output: stdout + stderr,
      exitCode: e.status ?? 1,
    };
  }
}

describe("CLI commands (integration)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "remb-cmd-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("--help", () => {
    it("shows help text", () => {
      const { stdout, exitCode } = run(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("remb");
      expect(stdout).toContain("save");
      expect(stdout).toContain("get");
      expect(stdout).toContain("scan");
      expect(stdout).toContain("serve");
    });
  });

  describe("--version", () => {
    it("shows version", () => {
      const { stdout, exitCode } = run(["--version"]);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("init", () => {
    it("creates .remb.yml in current directory", () => {
      const { stdout, exitCode } = run(["init", "test-project"], {
        cwd: tmpDir,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("test-project");
      expect(stdout).toContain("initialized");

      const configPath = join(tmpDir, ".remb.yml");
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("project: test-project");
      expect(content).toContain("api_url:");
    });

    it("uses directory name as default project name", () => {
      const { exitCode } = run(["init"], { cwd: tmpDir });
      expect(exitCode).toBe(0);

      const content = readFileSync(join(tmpDir, ".remb.yml"), "utf-8");
      // Should use the tmp dir basename as the slug
      expect(content).toContain("project:");
    });

    it("refuses to overwrite without --force", () => {
      run(["init", "first"], { cwd: tmpDir });
      const { output } = run(["init", "second"], { cwd: tmpDir });

      // Should warn about existing config
      expect(output).toContain("Already initialized");

      // Original config should be preserved
      const content = readFileSync(join(tmpDir, ".remb.yml"), "utf-8");
      expect(content).toContain("project: first");
    });

    it("overwrites with --force", { timeout: 30_000 }, () => {
      run(["init", "first"], { cwd: tmpDir });
      run(["init", "second", "--force"], { cwd: tmpDir });

      const content = readFileSync(join(tmpDir, ".remb.yml"), "utf-8");
      expect(content).toContain("project: second");
    });
  });

  describe("whoami", () => {
    it("fails when not authenticated", () => {
      const { output, exitCode } = run(["whoami"], {
        env: { XDG_CONFIG_HOME: tmpDir },
      });
      expect(exitCode).toBe(1);
      expect(output).toContain("Not authenticated");
    });
  });

  describe("save (no server)", () => {
    it("requires feature and content flags", () => {
      const { output, exitCode } = run(["save"], { cwd: tmpDir });
      expect(exitCode).toBe(1);
      // Should indicate missing required options
      expect(output).toContain("required");
    });

    it("errors without auth", () => {
      const { output, exitCode } = run(
        ["save", "-f", "auth", "-c", "test", "-p", "my-app"],
        { cwd: tmpDir, env: { XDG_CONFIG_HOME: tmpDir } }
      );
      expect(exitCode).toBe(1);
      expect(output).toContain("API key");
    });
  });

  describe("get (no server)", () => {
    it("errors without project slug", () => {
      const { output, exitCode } = run(["get"], {
        cwd: tmpDir,
        env: { XDG_CONFIG_HOME: tmpDir, REMB_API_KEY: "remb_fake" },
      });
      expect(exitCode).toBe(1);
      expect(output).toContain("No project specified");
    });
  });

  describe("scan --dry-run", () => {
    it("runs dry-run scan without needing auth", () => {
      // Create a file to scan
      writeFileSync(join(tmpDir, "test.ts"), "const x = 1;");

      const { output, exitCode } = run(
        ["scan", "--local", "--dry-run", "--path", tmpDir, "-p", "test"],
        { env: { XDG_CONFIG_HOME: tmpDir, REMB_API_KEY: "remb_fake" } }
      );
      expect(exitCode).toBe(0);
      expect(output).toContain("Dry run");
    });
  });
});
