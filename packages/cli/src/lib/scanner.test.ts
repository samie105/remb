import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanDirectory } from "./scanner.js";

describe("scanner", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "remb-scan-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("scans a directory with source files", async () => {
    // Create some test files
    writeFileSync(join(tmpDir, "index.ts"), 'export const hello = "world";');
    writeFileSync(
      join(tmpDir, "utils.ts"),
      "export function add(a: number, b: number) { return a + b; }"
    );

    const { files, results } = await scanDirectory({ path: tmpDir });

    expect(files).toHaveLength(2);
    expect(files.every((f) => f.language === "typescript")).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("groups files by directory", async () => {
    // Root files
    writeFileSync(join(tmpDir, "main.ts"), "export default {}");

    // Nested directory
    const subDir = join(tmpDir, "components");
    mkdirSync(subDir);
    writeFileSync(join(subDir, "button.tsx"), "export function Button() {}");
    writeFileSync(join(subDir, "input.tsx"), "export function Input() {}");

    const { results } = await scanDirectory({ path: tmpDir });

    // Should have at least 2 groups: root and components
    expect(results.length).toBeGreaterThanOrEqual(2);

    const featureNames = results.map((r) => r.featureName);
    expect(featureNames).toContain("components");
  });

  it("ignores node_modules and other defaults", async () => {
    mkdirSync(join(tmpDir, "node_modules", "some-pkg"), { recursive: true });
    writeFileSync(join(tmpDir, "node_modules", "some-pkg", "index.js"), "module.exports = {}");
    writeFileSync(join(tmpDir, "app.ts"), "console.log('hello');");

    const { files } = await scanDirectory({ path: tmpDir });

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe("app.ts");
  });

  it("respects custom ignore patterns", async () => {
    writeFileSync(join(tmpDir, "keep.ts"), "// keep");
    writeFileSync(join(tmpDir, "ignore-me.ts"), "// ignore");

    const { files } = await scanDirectory({
      path: tmpDir,
      ignore: ["**/ignore-me.ts"],
    });

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe("keep.ts");
  });

  it("respects depth limit", async () => {
    const deep = join(tmpDir, "a", "b", "c", "d");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, "deep.ts"), "// deep");
    writeFileSync(join(tmpDir, "shallow.ts"), "// shallow");

    const { files } = await scanDirectory({ path: tmpDir, depth: 1 });

    // Only shallow.ts should be found
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe("shallow.ts");
  });

  it("skips empty files", async () => {
    writeFileSync(join(tmpDir, "empty.ts"), "");
    writeFileSync(join(tmpDir, "notempty.ts"), "const x = 1;");

    const { files } = await scanDirectory({ path: tmpDir });

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe("notempty.ts");
  });

  it("skips non-source extensions", async () => {
    writeFileSync(join(tmpDir, "image.png"), "fake binary");
    writeFileSync(join(tmpDir, "app.ts"), "const x = 1;");

    const { files } = await scanDirectory({ path: tmpDir });

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe("app.ts");
  });

  it("throws on nonexistent directory", async () => {
    await expect(
      scanDirectory({ path: join(tmpDir, "nonexistent") })
    ).rejects.toThrow("Directory not found");
  });

  it("sets correct entry_type and tags on results", async () => {
    writeFileSync(join(tmpDir, "index.ts"), "export const x = 1;");

    const { results } = await scanDirectory({ path: tmpDir });

    expect(results[0].entryType).toBe("scan");
    expect(results[0].tags).toContain("auto-scan");
    expect(results[0].tags).toContain("typescript");
  });
});
