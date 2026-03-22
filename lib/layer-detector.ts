/**
 * Heuristic layer detection from file paths and content patterns.
 * Runs at scan time — no LLM call needed.
 */

export type LayerSlug =
  | "api"
  | "service"
  | "data"
  | "ui"
  | "middleware"
  | "utility"
  | "test"
  | "config"
  | "core";

interface LayerRule {
  slug: LayerSlug;
  name: string;
  /** Patterns matched against the full file path (lowercased). */
  pathPatterns: RegExp[];
  /** Patterns matched against file content (first 2000 chars). */
  contentPatterns?: RegExp[];
  priority: number; // higher = wins when multiple match
}

const LAYER_RULES: LayerRule[] = [
  {
    slug: "test",
    name: "Tests",
    pathPatterns: [
      /\.(test|spec)\.[jt]sx?$/,
      /__tests__\//,
      /\/tests?\//,
      /\.stories\.[jt]sx?$/,
      /\/fixtures?\//,
      /\/mocks?\//,
    ],
    priority: 100, // highest — test always wins
  },
  {
    slug: "config",
    name: "Configuration",
    pathPatterns: [
      /\.(config|rc)\.[jt]sx?$/,
      /\.env/,
      /\/config\//,
      /tsconfig/,
      /eslint/,
      /prettier/,
      /tailwind/,
      /postcss/,
      /next\.config/,
      /vite\.config/,
      /vitest\.config/,
      /trigger\.config/,
    ],
    priority: 90,
  },
  {
    slug: "middleware",
    name: "Middleware",
    pathPatterns: [/\/middleware\.[jt]sx?$/, /\/middleware\//],
    contentPatterns: [
      /NextRequest|NextResponse/,
      /req\s*,\s*res\s*,\s*next/,
    ],
    priority: 80,
  },
  {
    slug: "api",
    name: "API Layer",
    pathPatterns: [
      /\/api\/.*route\.[jt]sx?$/,
      /\/api\/.*\.[jt]sx?$/,
      /\/routes?\//,
      /\/controllers?\//,
      /\/handlers?\//,
    ],
    contentPatterns: [/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/],
    priority: 70,
  },
  {
    slug: "ui",
    name: "UI Layer",
    pathPatterns: [
      /\/components?\//,
      /\/pages?\//,
      /\/app\/.*page\.[jt]sx?$/,
      /\/app\/.*layout\.[jt]sx?$/,
      /\/app\/.*loading\.[jt]sx?$/,
      /\/app\/.*error\.[jt]sx?$/,
      /\/app\/.*not-found\.[jt]sx?$/,
      /\/app\/.*template\.[jt]sx?$/,
      /\/views?\//,
      /\/ui\//,
      /\/layouts?\//,
      /\.css$/,
      /\.scss$/,
    ],
    contentPatterns: [
      /['"]use client['"]/,
      /React\.createElement|jsx|<[A-Z]/,
      /export\s+default\s+function\s+\w+.*\(\s*\)/,
    ],
    priority: 60,
  },
  {
    slug: "data",
    name: "Data Layer",
    pathPatterns: [
      /\/models?\//,
      /\/schemas?\//,
      /\/migrations?\//,
      /\/supabase\//,
      /\/prisma\//,
      /\/drizzle\//,
      /\/repositories?\//,
      /\/db\//,
      /\/database\//,
    ],
    contentPatterns: [
      /createClient|supabase/,
      /mongoose\.|Schema\(|model\(/,
      /prisma\./,
      /\.from\(\s*['"]|\.select\(\s*['"]|\.insert\(/,
    ],
    priority: 55,
  },
  {
    slug: "service",
    name: "Service Layer",
    pathPatterns: [
      /\/services?\//,
      /\/actions?\//,
      /\/server-actions?\//,
      /\/use-cases?\//,
    ],
    contentPatterns: [/['"]use server['"]/],
    priority: 50,
  },
  {
    slug: "utility",
    name: "Utilities",
    pathPatterns: [
      /\/utils?\//,
      /\/helpers?\//,
      /\/lib\//,
      /\/shared\//,
      /\/common\//,
      /\/hooks?\//,
    ],
    priority: 20,
  },
  {
    slug: "core",
    name: "Core",
    pathPatterns: [/\/core\//, /\/domain\//],
    priority: 10,
  },
];

/**
 * Detect the layer for a file. Returns the best-matching layer slug.
 * Falls back to the LLM-detected layer if no heuristic matches.
 */
export function detectLayer(
  filePath: string,
  contentHead?: string,
  llmFallback?: LayerSlug,
): LayerSlug {
  const lowerPath = filePath.toLowerCase();
  let bestMatch: LayerSlug | null = null;
  let bestPriority = -1;

  for (const rule of LAYER_RULES) {
    const pathMatch = rule.pathPatterns.some((p) => p.test(lowerPath));
    if (pathMatch && rule.priority > bestPriority) {
      bestMatch = rule.slug;
      bestPriority = rule.priority;
    }
  }

  // Content-based detection if no path match or to upgrade priority
  if (contentHead) {
    const head = contentHead.slice(0, 2000);
    for (const rule of LAYER_RULES) {
      if (rule.contentPatterns && rule.priority > bestPriority) {
        const contentMatch = rule.contentPatterns.some((p) => p.test(head));
        if (contentMatch) {
          bestMatch = rule.slug;
          bestPriority = rule.priority;
        }
      }
    }
  }

  return bestMatch ?? llmFallback ?? "core";
}

/**
 * Returns all distinct layers present in a set of file paths.
 * Useful for building the project_layers table.
 */
export function detectProjectLayers(
  filePaths: string[],
): { slug: LayerSlug; name: string; file_patterns: string[] }[] {
  const layerFiles = new Map<LayerSlug, Set<string>>();

  for (const fp of filePaths) {
    const slug = detectLayer(fp);
    if (!layerFiles.has(slug)) layerFiles.set(slug, new Set());
    layerFiles.get(slug)!.add(fp);
  }

  return Array.from(layerFiles.entries()).map(([slug, files]) => {
    const rule = LAYER_RULES.find((r) => r.slug === slug);
    return {
      slug,
      name: rule?.name ?? slug,
      file_patterns: Array.from(files).slice(0, 20), // sample files
    };
  });
}
