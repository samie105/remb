import { readFileSync, statSync, existsSync } from "node:fs";
import { resolve, relative, extname, basename, dirname } from "node:path";
import { glob } from "glob";

/**
 * Default ignore patterns for scanning.
 */
const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.svelte-kit/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/venv/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
  "**/*.lock",
  "**/pnpm-lock.yaml",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/.env*",
  "**/*.png",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.gif",
  "**/*.svg",
  "**/*.ico",
  "**/*.woff*",
  "**/*.ttf",
  "**/*.eot",
];

/**
 * File extensions we consider scannable source code.
 */
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".rb",
  ".php",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".cs",
  ".vue",
  ".svelte",
  ".astro",
  ".md",
  ".mdx",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".sql",
  ".graphql",
  ".gql",
  ".prisma",
  ".proto",
  ".tf",
  ".dockerfile",
  ".sh",
  ".bash",
  ".zsh",
]);

export interface ScannedFile {
  relativePath: string;
  language: string;
  size: number;
  lines: number;
  content: string;
}

export interface ScanResult {
  featureName: string;
  content: string;
  entryType: string;
  tags: string[];
}

interface ScanOptions {
  path: string;
  depth?: number;
  ignore?: string[];
  maxFileSize?: number;
}

/**
 * Scan a directory and return structured context entries.
 */
export async function scanDirectory(
  opts: ScanOptions
): Promise<{ files: ScannedFile[]; results: ScanResult[] }> {
  const {
    path: scanPath,
    depth = 5,
    ignore = [],
    maxFileSize = 100_000, // 100KB per file
  } = opts;

  const rootDir = resolve(scanPath);

  if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  const allIgnore = [...DEFAULT_IGNORE, ...ignore];

  const files = await glob("**/*", {
    cwd: rootDir,
    nodir: true,
    ignore: allIgnore,
    maxDepth: depth,
    absolute: false,
  });

  const scannedFiles: ScannedFile[] = [];

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext) && ext !== "") continue;

    const fullPath = resolve(rootDir, file);
    const stat = statSync(fullPath);

    if (stat.size > maxFileSize || stat.size === 0) continue;

    const raw = readFileSync(fullPath, "utf-8");
    scannedFiles.push({
      relativePath: file,
      language: extToLanguage(ext),
      size: stat.size,
      lines: raw.split("\n").length,
      content: raw,
    });
  }

  // Group files by directory (each directory ≈ a feature)
  const dirGroups = new Map<string, ScannedFile[]>();
  for (const f of scannedFiles) {
    const dir = dirname(f.relativePath);
    const group = dirGroups.get(dir) ?? [];
    group.push(f);
    dirGroups.set(dir, group);
  }

  const results: ScanResult[] = [];

  for (const [dir, groupFiles] of dirGroups) {
    const featureName = dir === "." ? basename(rootDir) : dir.replace(/\//g, "-");

    // Build a summary of the directory
    const fileSummaries = groupFiles.map((f) => {
      const preview =
        f.content.length > 500
          ? f.content.slice(0, 500) + "\n... (truncated)"
          : f.content;
      return `### ${f.relativePath}\n\`\`\`${f.language}\n${preview}\n\`\`\``;
    });

    const entryContent = [
      `# Directory: ${dir === "." ? basename(rootDir) : dir}`,
      ``,
      `**Files:** ${groupFiles.length} | **Languages:** ${[...new Set(groupFiles.map((f) => f.language))].join(", ")}`,
      `**Total lines:** ${groupFiles.reduce((sum, f) => sum + f.lines, 0)}`,
      ``,
      ...fileSummaries,
    ].join("\n");

    // Avoid exceeding the API's 50k char limit
    const truncated =
      entryContent.length > 45_000
        ? entryContent.slice(0, 45_000) + "\n\n... (truncated due to size)"
        : entryContent;

    results.push({
      featureName,
      content: truncated,
      entryType: "scan",
      tags: [
        "auto-scan",
        ...new Set(groupFiles.map((f) => f.language)),
      ],
    });
  }

  return { files: scannedFiles, results };
}

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".mts": "typescript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".cs": "csharp",
    ".vue": "vue",
    ".svelte": "svelte",
    ".astro": "astro",
    ".md": "markdown",
    ".mdx": "mdx",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".prisma": "prisma",
    ".proto": "protobuf",
    ".tf": "terraform",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "zsh",
    ".dockerfile": "dockerfile",
    ".ini": "ini",
    ".cfg": "ini",
  };
  return map[ext] ?? "text";
}
