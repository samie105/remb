const GITHUB_API = "https://api.github.com";

/* ─── types ─── */

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface RepoFile {
  path: string;
  sha: string;
  size: number;
}

/* ─── file filtering ─── */

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".nuxt",
  "dist",
  "build",
  ".git",
  ".cache",
  "__pycache__",
  ".turbo",
  "coverage",
  ".vercel",
  ".output",
  "vendor",
  "target",
]);

const IGNORED_EXTENSIONS = new Set([
  ".lock",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
  ".wav",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".map",
  ".min.js",
  ".min.css",
  ".d.ts",
]);

const IGNORED_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".DS_Store",
  "thumbs.db",
  ".env",
  ".env.local",
  ".env.production",
]);

// Parse a .rembignore-style ignore list (newline-separated path prefixes/globs).
// Supports path prefixes, glob wildcards (*.generated.ts, **\/*.stories.tsx), and # comments.
export function parseIgnorePatterns(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** Convert a simple glob pattern to a RegExp (supports * and **). */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials except * ?
    .replace(/\*\*/g, "\x00")             // placeholder for **
    .replace(/\*/g, "[^/]*")              // * = anything except slash
    .replace(/\x00/g, ".*");              // ** = anything
  return new RegExp(`(^|/)${escaped}(/|$)`);
}

/**
 * Returns true if a file path matches any of the user-supplied ignore patterns.
 * Patterns can be path prefixes ("__tests__") or simple globs ("*.stories.tsx").
 */
export function isIgnoredByPatterns(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const regex = globToRegex(pattern);
    if (regex.test(filePath)) return true;
  }
  return false;
}

/** Check if a file path should be scanned (built-in rules only) */
function isRelevantFile(path: string): boolean {
  // Check ignored directories
  const parts = path.split("/");
  for (const part of parts) {
    if (IGNORED_DIRS.has(part)) return false;
  }

  // Check ignored files
  const filename = parts[parts.length - 1];
  if (IGNORED_FILES.has(filename)) return false;

  // Check ignored extensions
  for (const ext of IGNORED_EXTENSIONS) {
    if (path.endsWith(ext)) return false;
  }

  // Only include code-like files
  const codeExtensions = [
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb",
    ".java", ".kt", ".swift", ".vue", ".svelte", ".astro",
    ".css", ".scss", ".less", ".sql", ".graphql", ".prisma",
    ".yaml", ".yml", ".toml",
  ];

  return codeExtensions.some((ext) => path.endsWith(ext));
}

/* ─── API calls ─── */

/** Fetch the default branch for a repo from GitHub */
export async function getDefaultBranch(
  token: string,
  repoName: string,
): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${repoName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (res.status === 404) {
    throw new Error(
      `Repository "${repoName}" not found. Check the repo name in project settings and that your GitHub token has access to it.`,
    );
  }
  if (!res.ok) throw new Error(`Failed to fetch repo metadata: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { default_branch: string };
  return data.default_branch ?? "main";
}

/**
 * Try to read a .rembignore file from the root of the repo.
 * Returns an empty array if not found.
 */
export async function getRembIgnorePatterns(
  token: string,
  repoName: string,
  branch: string
): Promise<string[]> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${repoName}/contents/.rembignore?ref=${encodeURIComponent(branch)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.raw+json",
        },
      }
    );
    if (!res.ok) return [];
    const text = await res.text();
    return parseIgnorePatterns(text);
  } catch {
    return [];
  }
}

/** Fetch the full file tree for a repo recursively */
export async function getRepoFiles(
  token: string,
  repoName: string,
  branch = "main",
  extraIgnorePatterns: string[] = []
): Promise<{ files: RepoFile[]; truncated: boolean; branch: string }> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };

  let res = await fetch(
    `${GITHUB_API}/repos/${repoName}/git/trees/${branch}?recursive=1`,
    { headers },
  );

  // If the branch wasn't found, look up the repo's actual default branch and retry
  if (res.status === 404) {
    let defaultBranch: string;
    try {
      defaultBranch = await getDefaultBranch(token, repoName);
    } catch (err) {
      // Re-throw with context — repo not found or no token access
      throw err;
    }
    if (defaultBranch !== branch) {
      branch = defaultBranch;
      res = await fetch(
        `${GITHUB_API}/repos/${repoName}/git/trees/${branch}?recursive=1`,
        { headers },
      );
    }
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch repo tree: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { tree: GitHubTreeItem[]; truncated: boolean };

  const files = data.tree
    .filter((item): item is GitHubTreeItem & { size: number } =>
      item.type === "blob" && item.size != null && isRelevantFile(item.path)
    )
    .filter((item) => item.size < 100_000) // skip files > 100KB
    .filter((item) => extraIgnorePatterns.length === 0 || !isIgnoredByPatterns(item.path, extraIgnorePatterns))
    .map((item) => ({
      path: item.path,
      sha: item.sha,
      size: item.size,
    }));

  return { files, truncated: data.truncated ?? false, branch };
}

/** Fetch a single file's content from GitHub (20s timeout to prevent hangs) */
export async function getFileContent(
  token: string,
  repoName: string,
  path: string
): Promise<string> {
  // Encode each path segment individually so slashes are preserved,
  // but special characters (spaces, brackets, etc.) in filenames are safe.
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(
    `${GITHUB_API}/repos/${repoName}/contents/${encodedPath}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw+json",
      },
      signal: AbortSignal.timeout(20_000),
    }
  );

  if (res.status === 403 || res.status === 429) {
    // Rate limited — wait 5s then throw so caller can retry
    await new Promise((r) => setTimeout(r, 5000));
    throw new Error(`GitHub rate limited for ${path}: ${res.status}`);
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch file ${path}: ${res.status}`);
  }

  return res.text();
}

/** Fetch the latest commit SHA for a branch */
export async function getLatestCommitSha(
  token: string,
  repoName: string,
  branch = "main"
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${repoName}/commits/${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.sha",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch latest commit: ${res.status} ${res.statusText}`);
  }

  return (await res.text()).trim();
}

/** Process files in batches to respect rate limits */
export async function processInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

/**
 * Download the entire repo as a tarball and extract file contents in one shot.
 * Returns a Map<filePath, content> for all files matching the given paths.
 *
 * This is dramatically faster than individual getFileContent calls:
 *   - 1 HTTP request vs N requests
 *   - No rate limiting concerns
 *   - All content available immediately for import parsing + AI extraction
 *
 * Falls back to per-file fetching if tarball download fails.
 */
export async function downloadRepoContents(
  token: string,
  repoName: string,
  branch: string,
  filePaths: Set<string>,
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();

  const res = await fetch(
    `${GITHUB_API}/repos/${repoName}/tarball/${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(120_000), // 2 min timeout for large repos
      redirect: "follow",
    },
  );

  if (!res.ok) {
    throw new Error(`Tarball download failed: ${res.status} ${res.statusText}`);
  }

  // GitHub returns a gzipped tarball — decompress and parse
  const { Readable } = await import("node:stream");
  const { createGunzip } = await import("node:zlib");
  const { extract } = await import("tar-stream");

  const buffer = Buffer.from(await res.arrayBuffer());
  const extractor = extract();

  return new Promise<Map<string, string>>((resolve, reject) => {
    extractor.on("entry", (header, stream, next) => {
      // GitHub tarball paths are: <owner>-<repo>-<sha>/<actual-path>
      // Strip the first directory component to get the real file path
      const fullPath = header.name;
      const slashIdx = fullPath.indexOf("/");
      const repoPath = slashIdx >= 0 ? fullPath.slice(slashIdx + 1) : fullPath;

      if (header.type === "file" && filePaths.has(repoPath)) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          // Skip files that are too large (>100KB) or binary-looking
          if (text.length <= 100_000 && !text.includes("\0")) {
            contents.set(repoPath, text);
          }
          next();
        });
        stream.on("error", () => next());
      } else {
        stream.resume();
        next();
      }
    });

    extractor.on("finish", () => resolve(contents));
    extractor.on("error", reject);

    const gunzip = createGunzip();
    gunzip.on("error", reject);

    const readable = Readable.from(buffer);
    readable.pipe(gunzip).pipe(extractor);
  });
}
