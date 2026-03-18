/**
 * Lightweight import/require parser for JavaScript/TypeScript files.
 *
 * Extracts actual code-level imports from file content using regex.
 * No AST required — this is fast and runs during the scan alongside
 * the LLM feature extraction.
 */

export type ImportType = "static" | "dynamic" | "re-export" | "side-effect";

export interface ExtractedImport {
  /** Raw import path as written in source, e.g. "@/components/ui/button" */
  rawPath: string;
  /** Resolved project-relative path, e.g. "components/ui/button.tsx" (null if external package) */
  resolvedPath: string | null;
  /** What symbols were imported */
  symbols: string[];
  importType: ImportType;
  /** Whether this is a node_modules / external package */
  isExternal: boolean;
}

/* ─── Regex patterns ──────────────────────────────────────────────────────── */

// import X from 'path'
// import { X, Y } from 'path'
// import * as X from 'path'
// import 'path'
const STATIC_IMPORT_RE =
  /import\s+(?:(?:(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))\s*,?\s*)*(?:(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))\s*)?\s*from\s+)?['"]([^'"]+)['"]/g;

// export { X, Y } from 'path'
// export * from 'path'
// export * as X from 'path'
const RE_EXPORT_RE =
  /export\s+(?:(\{[^}]+\})|(\*(?:\s+as\s+\w+)?))\s+from\s+['"]([^'"]+)['"]/g;

// const X = require('path')
// require('path')
const REQUIRE_RE =
  /(?:(?:const|let|var)\s+(?:(\{[^}]+\})|(\w+))\s*=\s*)?require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// import('path') — dynamic
const DYNAMIC_IMPORT_RE =
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/* ─── Path resolution ─────────────────────────────────────────────────────── */

/** Common extensions to try when resolving bare import paths */
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const INDEX_FILES = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

/** Alias mappings — extend as needed */
const ALIAS_MAP: Record<string, string> = {
  "@/": "",       // @/ → project root
  "~/": "",       // ~/ → project root (some projects)
};

/**
 * Resolve an import path to a project-relative file path.
 *
 * @param importPath  The raw import string, e.g. "./utils" or "@/lib/auth"
 * @param fromFile    The importing file's project-relative path, e.g. "app/dashboard/page.tsx"
 * @param fileIndex   Set of all known file paths in the project
 * @returns Resolved project-relative path, or null if external/unresolvable
 */
function resolveImportPath(
  importPath: string,
  fromFile: string,
  fileIndex: Set<string>,
): string | null {
  // External package — no path prefix
  if (!importPath.startsWith(".") && !importPath.startsWith("@/") && !importPath.startsWith("~/")) {
    return null;
  }

  let basePath: string;

  // Handle aliases
  for (const [alias, replacement] of Object.entries(ALIAS_MAP)) {
    if (importPath.startsWith(alias)) {
      basePath = replacement + importPath.slice(alias.length);
      return tryResolve(basePath, fileIndex);
    }
  }

  // Relative path — resolve from the importing file's directory
  const fromDir = fromFile.split("/").slice(0, -1).join("/");
  const parts = importPath.split("/");
  const resolvedParts = fromDir ? fromDir.split("/") : [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      resolvedParts.pop();
    } else {
      resolvedParts.push(part);
    }
  }

  basePath = resolvedParts.join("/");
  return tryResolve(basePath, fileIndex);
}

/** Try matching a base path (no extension) against the file index */
function tryResolve(basePath: string, fileIndex: Set<string>): string | null {
  // Try exact match first (might already have extension)
  if (fileIndex.has(basePath)) return basePath;

  // Try with extensions
  for (const ext of EXTENSIONS) {
    const candidate = basePath + ext;
    if (fileIndex.has(candidate)) return candidate;
  }

  // Try as directory with index file
  for (const idx of INDEX_FILES) {
    const candidate = basePath + idx;
    if (fileIndex.has(candidate)) return candidate;
  }

  return null;
}

/* ─── Symbol extraction helpers ───────────────────────────────────────────── */

function parseNamedImports(braceBlock: string): string[] {
  // "{ Button, Input as MyInput, type Theme }" → ["Button", "Input", "Theme"]
  return braceBlock
    .replace(/[{}]/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // Handle: "type X", "X as Y"
      const parts = s.split(/\s+/);
      if (parts[0] === "type" || parts[0] === "typeof") return parts[1] ?? "";
      return parts[0];
    })
    .filter(Boolean);
}

/* ─── Main extraction function ────────────────────────────────────────────── */

/**
 * Extract all imports from a file's source content.
 *
 * @param content   File source code
 * @param filePath  Project-relative path of the file
 * @param fileIndex Set of all known file paths in the project (for resolution)
 * @returns Array of extracted imports
 */
export function extractImports(
  content: string,
  filePath: string,
  fileIndex: Set<string>,
): ExtractedImport[] {
  const results: ExtractedImport[] = [];
  const seen = new Set<string>(); // dedupe by rawPath + type

  // Helper to add a result
  function add(rawPath: string, symbols: string[], importType: ImportType) {
    const key = `${rawPath}::${importType}`;
    if (seen.has(key)) return;
    seen.add(key);

    const isExternal = !rawPath.startsWith(".") && !rawPath.startsWith("@/") && !rawPath.startsWith("~/");
    const resolvedPath = isExternal ? null : resolveImportPath(rawPath, filePath, fileIndex);

    results.push({
      rawPath,
      resolvedPath,
      symbols,
      importType,
      isExternal,
    });
  }

  // 1. Static imports
  let match: RegExpExecArray | null;
  STATIC_IMPORT_RE.lastIndex = 0;
  while ((match = STATIC_IMPORT_RE.exec(content)) !== null) {
    const rawPath = match[7];
    if (!rawPath) continue;

    const symbols: string[] = [];

    // Named imports in braces (groups 1 and 4)
    if (match[1]) symbols.push(...parseNamedImports(match[1]));
    if (match[4]) symbols.push(...parseNamedImports(match[4]));

    // Namespace imports (groups 2 and 5) — "* as X"
    if (match[2]) symbols.push(match[2].replace(/\*\s+as\s+/, "").trim());
    if (match[5]) symbols.push(match[5].replace(/\*\s+as\s+/, "").trim());

    // Default imports (groups 3 and 6)
    if (match[3]) symbols.push(match[3]);
    if (match[6]) symbols.push(match[6]);

    const importType: ImportType = symbols.length === 0 ? "side-effect" : "static";
    add(rawPath, symbols, importType);
  }

  // 2. Re-exports
  RE_EXPORT_RE.lastIndex = 0;
  while ((match = RE_EXPORT_RE.exec(content)) !== null) {
    const rawPath = match[3];
    if (!rawPath) continue;

    const symbols: string[] = [];
    if (match[1]) symbols.push(...parseNamedImports(match[1]));
    if (match[2] && match[2].includes("*")) symbols.push("*");

    add(rawPath, symbols, "re-export");
  }

  // 3. require() calls
  REQUIRE_RE.lastIndex = 0;
  while ((match = REQUIRE_RE.exec(content)) !== null) {
    const rawPath = match[3];
    if (!rawPath) continue;

    const symbols: string[] = [];
    if (match[1]) symbols.push(...parseNamedImports(match[1]));
    if (match[2]) symbols.push(match[2]);

    add(rawPath, symbols, "static");
  }

  // 4. Dynamic imports
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((match = DYNAMIC_IMPORT_RE.exec(content)) !== null) {
    const rawPath = match[1];
    if (!rawPath) continue;
    add(rawPath, [], "dynamic");
  }

  return results;
}

/**
 * Filter to only internal (project-local) imports that resolved to a real file.
 */
export function getInternalImports(imports: ExtractedImport[]): ExtractedImport[] {
  return imports.filter((i) => !i.isExternal && i.resolvedPath !== null);
}

/**
 * Get external package names (deduplicated).
 */
export function getExternalPackages(imports: ExtractedImport[]): string[] {
  const packages = new Set<string>();
  for (const i of imports) {
    if (!i.isExternal) continue;
    // Extract package name: "@scope/pkg" or "pkg"
    const parts = i.rawPath.split("/");
    const name = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
    packages.add(name);
  }
  return [...packages];
}
