import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/** Re-export the singleton client for direct usage */
export function getOpenAI(): OpenAI {
  return getOpenAIClient();
}

/* ─── types ─── */

export interface ImportContext {
  path: string;
  summary: string;
  symbols: string[];
}

export interface ExtractedFeature {
  feature_name: string;
  summary: string;
  category: "core" | "ui" | "data" | "infra" | "integration";
  importance: number;
  key_decisions: string[];
  dependencies: string[];
  gotchas: string[];
  tags: string[];
}

/* ─── scanning prompt ─── */

const SCANNING_PROMPT = `You are a senior developer documenting code for an AI context system.
Given the following code, extract the HIGH-LEVEL FEATURE it belongs to — not implementation details.

Rules:
- feature_name must be a real product feature or system (e.g. "Authentication", "Project Management", "Dashboard", "API Layer", "Notification System", "Database Schema").
- NEVER name features after utilities, CSS helpers, icon wrappers, small UI primitives, or library internals (e.g. NOT "clsx merger", "icon component", "button variant", "theme toggle").
- If the file is a small utility, component primitive, or config file, identify the LARGER feature or system it serves (e.g. a theme toggle belongs to "Theming & Appearance", a button component belongs to "Design System").

- category — MUST be exactly one of these five values. Choose carefully:
  • "ui" — Components, pages, layouts, styling, design system, themes, forms, modals, navigation, any visual/interactive elements. If the file renders UI or defines how things look, use "ui".
  • "data" — Database schemas, queries, ORM models, data fetching, caching, state management stores, migrations, data transformations, API response handling.
  • "infra" — Configuration files, build tooling, CI/CD, deployment, environment variables, logging, monitoring, middleware, error handling infrastructure, auth middleware.
  • "integration" — Third-party API clients, webhooks, OAuth flows, external service connectors, SDK wrappers, payment processing, email/notification providers.
  • "core" — ONLY for central business logic that doesn't fit the above: domain models, core algorithms, shared type definitions that define the domain, primary server actions. This should be the LEAST common category, not the default.

- importance: 1-10 integer, where 10 is the most critical to the application.
- summary: 2-3 sentence plain English description of the feature (not the file).
- key_decisions: array of architectural or implementation choices made.
- dependencies: other features or libraries this relies on.
- gotchas: things a developer must know when working with this code.
- tags: relevant keywords.

Return ONLY valid JSON. No preamble.`;

/* ─── extract features from a single file ─── */

export async function extractFeaturesFromFile(
  content: string,
  filename: string,
  importContext?: ImportContext[],
): Promise<ExtractedFeature | null> {
  const openai = getOpenAIClient();

  // Truncate very large files to avoid token limits
  const maxChars = 12_000;
  const truncated = content.length > maxChars
    ? content.slice(0, maxChars) + "\n// ... truncated"
    : content;

  // Build user message with optional relational context
  let userMessage = `File: ${filename}\n\n`;

  if (importContext && importContext.length > 0) {
    userMessage += "This file imports the following modules (already analyzed):\n";
    for (const imp of importContext.slice(0, 15)) {
      const syms = imp.symbols.length > 0 ? ` (uses: ${imp.symbols.join(", ")})` : "";
      userMessage += `- ${imp.path}${syms}: ${imp.summary}\n`;
    }
    userMessage += "\nUse this context to understand how this file fits into the larger system.\n\n";
  }

  userMessage += `Code:\n${truncated}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SCANNING_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as ExtractedFeature;
    // Validate required fields
    if (!parsed.feature_name || !parsed.summary) return null;
    const validCategories = ["core", "ui", "data", "infra", "integration"] as const;
    const category = validCategories.includes(parsed.category as typeof validCategories[number])
      ? parsed.category
      : "core";
    return {
      feature_name: parsed.feature_name,
      summary: parsed.summary,
      category,
      importance: Math.min(10, Math.max(1, Number(parsed.importance) || 5)),
      key_decisions: parsed.key_decisions ?? [],
      dependencies: parsed.dependencies ?? [],
      gotchas: parsed.gotchas ?? [],
      tags: parsed.tags ?? [],
    };
  } catch {
    return null;
  }
}

/* ─── granular code graph extraction ─── */

export type CodeNodeType = "file" | "function" | "class" | "method" | "type" | "export" | "module" | "hook" | "component";

export interface ExtractedSymbol {
  name: string;
  type: CodeNodeType;
  line_start?: number;
  line_end?: number;
  summary: string;
  complexity: "simple" | "moderate" | "complex";
  params?: string[];
  return_type?: string;
  methods?: string[];
  properties?: string[];
}

export interface ExtractedCall {
  from: string;
  to: string;
  target_file?: string;
}

export interface ExtractedDataFlow {
  symbol: string;
  reads_from?: string;
  writes_to?: string;
  validates?: string;
  transforms?: string;
}

export interface GranularExtraction {
  feature_name: string;
  summary: string;
  category: "core" | "ui" | "data" | "infra" | "integration";
  importance: number;
  layer: string;
  symbols: ExtractedSymbol[];
  internal_calls: ExtractedCall[];
  data_flows: ExtractedDataFlow[];
  key_decisions: string[];
  dependencies: string[];
  gotchas: string[];
  tags: string[];
}

const GRANULAR_EXTRACTION_PROMPT = `You are a senior developer building a code knowledge graph for an AI context platform.
Given the following code, extract EVERY meaningful symbol and their relationships.

Return JSON with these fields:

1. feature_name: The high-level product feature this file belongs to (e.g. "Authentication", "Dashboard", "Scanning Pipeline").
2. summary: 2-3 sentence description of what this file does.
3. category: Exactly one of: "ui" | "data" | "infra" | "integration" | "core"
   - ui: Components, pages, layouts, styling, design system, themes, forms, modals, navigation
   - data: Database schemas, queries, ORM, state management, migrations, data transforms
   - infra: Config, build tooling, CI/CD, deployment, env vars, logging, middleware
   - integration: Third-party APIs, webhooks, OAuth, external SDKs, payment, email
   - core: Central business logic, domain models, core algorithms, shared types (LEAST COMMON)
4. importance: 1-10 criticality rating.
5. layer: Exactly one of: "api" | "service" | "data" | "ui" | "middleware" | "utility" | "test" | "config" | "core"
   Detected from file path and content:
   - api: Route handlers, API endpoints, controllers
   - service: Business logic services, server actions, use cases
   - data: Database access, models, schemas, migrations, repositories
   - ui: React components, pages, layouts, CSS, design system
   - middleware: Request/response middleware, guards, interceptors
   - utility: Helpers, utils, shared libs, common functions
   - test: Test files, test utilities, fixtures
   - config: Configuration, env, settings, build tooling
   - core: Core domain logic that doesn't fit above

6. symbols: Array of every function, class, type, hook, component, and notable export:
   [{ "name": "loginUser", "type": "function", "line_start": 10, "line_end": 45,
      "summary": "Authenticates user via GitHub OAuth token exchange",
      "complexity": "moderate", "params": ["code: string", "state: string"],
      "return_type": "Promise<Session>" }]
   - type values: "function" | "class" | "method" | "type" | "export" | "hook" | "component"
   - complexity: "simple" (<10 lines, no branching) | "moderate" (10-50 lines or some branching) | "complex" (>50 lines, deep nesting, many branches)
   - For classes: include "methods" and "properties" arrays
   - For hooks: always use type "hook" (e.g. useAuth, useMobile)
   - For React components: use type "component"

7. internal_calls: Function-to-function call relationships within and across files:
   [{ "from": "loginUser", "to": "validateToken", "target_file": "lib/jwt.ts" }]
   - Only include calls to OTHER functions (not standard library or framework calls)
   - target_file is optional — omit if calling within the same file

8. data_flows: How data moves through this file:
   [{ "symbol": "loginUser", "reads_from": "users table via supabase", "writes_to": "session cookie" }]
   - reads_from: databases, APIs, stores, caches, file system
   - writes_to: databases, APIs, stores, cookies, responses
   - validates: what data is validated and how
   - transforms: what data transformations occur

9. key_decisions: Architectural choices made in this file.
10. dependencies: External libraries and internal modules this depends on.
11. gotchas: Non-obvious things a developer must know.
12. tags: Relevant keywords for search.

Be thorough with symbols — extract EVERY exported function, class, type alias, and named constant.
For internal_calls, trace the actual call chain — which function calls which other function.

Return ONLY valid JSON. No preamble.`;

/**
 * Extract granular code nodes and relationships from a single file.
 * This powers the code_nodes + code_edges knowledge graph.
 */
export async function extractGranularCodeGraph(
  content: string,
  filename: string,
  importContext?: ImportContext[],
): Promise<GranularExtraction | null> {
  const openai = getOpenAIClient();

  const maxChars = 12_000;
  const truncated = content.length > maxChars
    ? content.slice(0, maxChars) + "\n// ... truncated"
    : content;

  let userMessage = `File: ${filename}\n\n`;

  if (importContext && importContext.length > 0) {
    userMessage += "This file imports the following modules (already analyzed):\n";
    for (const imp of importContext.slice(0, 15)) {
      const syms = imp.symbols.length > 0 ? ` (uses: ${imp.symbols.join(", ")})` : "";
      userMessage += `- ${imp.path}${syms}: ${imp.summary}\n`;
    }
    userMessage += "\nUse this context to understand how this file fits into the larger system.\n\n";
  }

  userMessage += `Code:\n${truncated}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: GRANULAR_EXTRACTION_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as GranularExtraction;
    if (!parsed.feature_name || !parsed.summary) return null;

    const validCategories = ["core", "ui", "data", "infra", "integration"] as const;
    const validLayers = ["api", "service", "data", "ui", "middleware", "utility", "test", "config", "core"] as const;

    return {
      feature_name: parsed.feature_name,
      summary: parsed.summary,
      category: validCategories.includes(parsed.category as typeof validCategories[number]) ? parsed.category : "core",
      importance: Math.min(10, Math.max(1, Number(parsed.importance) || 5)),
      layer: validLayers.includes(parsed.layer as typeof validLayers[number]) ? parsed.layer : "core",
      symbols: Array.isArray(parsed.symbols) ? parsed.symbols.map((s) => ({
        name: s.name ?? "unknown",
        type: s.type ?? "function",
        line_start: s.line_start,
        line_end: s.line_end,
        summary: s.summary ?? "",
        complexity: (["simple", "moderate", "complex"] as const).includes(s.complexity) ? s.complexity : "simple",
        params: s.params,
        return_type: s.return_type,
        methods: s.methods,
        properties: s.properties,
      })) : [],
      internal_calls: Array.isArray(parsed.internal_calls) ? parsed.internal_calls : [],
      data_flows: Array.isArray(parsed.data_flows) ? parsed.data_flows : [],
      key_decisions: parsed.key_decisions ?? [],
      dependencies: parsed.dependencies ?? [],
      gotchas: parsed.gotchas ?? [],
      tags: parsed.tags ?? [],
    };
  } catch {
    return null;
  }
}

/* ─── generate embedding ─── */

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = (process.env.EMBEDDING_PROVIDER ?? "openai").toLowerCase();

  if (provider === "local") {
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    const model = process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text";

    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Local embedding failed (${res.status}). Ensure Ollama is running and model '${model}' is pulled. ${body.slice(0, 200)}`
      );
    }

    const data = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(data.embedding)) {
      throw new Error("Local embedding response missing embedding vector");
    }
    return data.embedding;
  }

  if (provider !== "openai") {
    throw new Error(`Unsupported EMBEDDING_PROVIDER '${provider}'. Use 'openai' or 'local'.`);
  }

  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}

/* ─── synthesize memories from project data ─── */

const MEMORY_SYNTHESIS_PROMPT = `You are an expert at analyzing codebases and extracting reusable knowledge for AI coding assistants.

Given a project's features, context entries, and code samples, synthesize a set of discrete "memories" — each one a distinct, actionable piece of knowledge an AI agent should know when working on this project.

Generate memories in these categories:
- "pattern": Recurring code patterns, naming conventions, architectural patterns used
- "decision": Key architectural or tech stack decisions and WHY they were made
- "knowledge": How the project is structured, what the main modules do, key file locations
- "preference": Coding style preferences, library choices, configuration conventions

Rules:
- Each memory should be self-contained and useful on its own
- Be specific — reference actual feature names, file patterns, tech stack items
- Analyze code samples to identify repetitive patterns, consistent coding styles, library usage patterns, and naming conventions
- Focus on non-obvious knowledge that would help an AI avoid mistakes
- Do NOT generate generic advice — only project-specific insights
- Generate 5-10 memories covering the most important aspects
- importance: 1-10 for each (how critical is this for working on the project)

Return a JSON array of objects:
[
  {
    "title": "Short descriptive title",
    "content": "Detailed memory content (2-4 sentences)",
    "category": "pattern" | "decision" | "knowledge" | "preference",
    "tags": ["relevant", "tags"],
    "importance": 8
  }
]

Return ONLY the JSON array. No preamble.`;

export interface SynthesizedMemory {
  title: string;
  content: string;
  category: "pattern" | "decision" | "knowledge" | "preference";
  tags: string[];
  importance: number;
}

export async function synthesizeMemories(
  projectName: string,
  features: Array<{ name: string; description: string | null; category: string; importance: number; files: string[]; tags: string[]; contentSnippets?: string[] }>,
  techStack: string[],
): Promise<SynthesizedMemory[]> {
  const openai = getOpenAIClient();

  const featureSummary = features
    .map((f) => {
      let summary = `- ${f.name} [${f.category}, importance: ${f.importance}/10]: ${f.description ?? "No description"}\n  Files: ${f.files.slice(0, 5).join(", ")}${f.files.length > 5 ? ` (+${f.files.length - 5} more)` : ""}\n  Tags: ${f.tags.join(", ")}`;
      if (f.contentSnippets?.length) {
        summary += `\n  Code samples:\n${f.contentSnippets.map((s) => `    ${s}`).join("\n---\n")}`;
      }
      return summary;
    })
    .join("\n");

  const input = `Project: ${projectName}
Tech Stack: ${techStack.join(", ") || "Unknown"}

Features (${features.length} total):
${featureSummary}`;

  // Cap input to avoid token limits
  const truncated = input.length > 30_000 ? input.slice(0, 30_000) + "\n... (truncated)" : input;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4.1-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: MEMORY_SYNTHESIS_PROMPT },
      { role: "user", content: truncated },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : parsed.memories ?? [];
    const validCategories = ["pattern", "decision", "knowledge", "preference"];

    return arr
      .filter((m: SynthesizedMemory) => m.title && m.content)
      .map((m: SynthesizedMemory) => ({
        title: String(m.title),
        content: String(m.content),
        category: validCategories.includes(m.category) ? m.category : "knowledge",
        tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
        importance: Math.min(10, Math.max(1, Number(m.importance) || 5)),
      }));
  } catch {
    return [];
  }
}

/* ─── architecture analysis (multi-agent Phase 3) ─── */

const ARCHITECTURE_ANALYSIS_PROMPT = `You are a senior software architect analyzing a codebase.
Given file summaries grouped by directory, produce a semantic architecture analysis.

For each logical layer you identify:
1. Give it a short name (e.g. "API Layer", "Service Layer", "Data Access Layer")
2. A slug (kebab-case, e.g. "api", "service", "data-access")
3. A 1-2 sentence description of its responsibility
4. The file paths that belong to it
5. Cross-cutting concerns (patterns that span multiple layers)
6. Dependency direction (which layers depend on which)

Rules:
- Identify 3-8 layers. Every file must belong to exactly one layer.
- Use the file summaries + directory structure as primary signals.
- If a file doesn't clearly fit, assign it to the closest layer or a "Utility" layer.
- Cross-cutting concerns include: logging, auth, error handling, validation.
- Dependency arrows flow from dependent → dependency (e.g. "api → service → data").

Return ONLY valid JSON in this shape:
{
  "layers": [
    {
      "name": "API Layer",
      "slug": "api",
      "description": "HTTP endpoints, route handlers, and request/response processing",
      "file_paths": ["src/routes/auth.ts", "src/routes/users.ts"],
      "confidence": 0.9
    }
  ],
  "cross_cutting": [
    { "name": "Authentication", "files": ["src/middleware/auth.ts", "src/routes/auth.ts"], "description": "Auth checks span API and middleware layers" }
  ],
  "dependency_graph": [
    { "from": "api", "to": "service", "strength": "strong" },
    { "from": "service", "to": "data", "strength": "strong" }
  ],
  "architecture_style": "layered" | "modular" | "microservice" | "monolith" | "event-driven" | "serverless",
  "summary": "2-3 sentence architecture overview"
}`;

export interface ArchitectureLayer {
  name: string;
  slug: string;
  description: string;
  file_paths: string[];
  confidence: number;
}

export interface CrossCuttingConcern {
  name: string;
  files: string[];
  description: string;
}

export interface ArchitectureAnalysis {
  layers: ArchitectureLayer[];
  cross_cutting: CrossCuttingConcern[];
  dependency_graph: Array<{ from: string; to: string; strength: string }>;
  architecture_style: string;
  summary: string;
}

/**
 * LLM-powered architecture analysis. Takes file summaries grouped by directory
 * and produces semantic layer assignment + cross-cutting concern detection.
 *
 * This is the "Architect" agent in the multi-agent scan pipeline.
 */
export async function analyzeArchitecture(
  projectName: string,
  fileSummaries: Array<{ path: string; summary: string; category: string; importance: number; tags: string[] }>,
  techStack: string[],
): Promise<ArchitectureAnalysis | null> {
  const openai = getOpenAIClient();

  // Group files by top-level directory for better LLM context
  const grouped = new Map<string, typeof fileSummaries>();
  for (const f of fileSummaries) {
    const dir = f.path.split("/").slice(0, 2).join("/") || f.path;
    const group = grouped.get(dir) ?? [];
    group.push(f);
    grouped.set(dir, group);
  }

  let input = `Project: ${projectName}\nTech Stack: ${techStack.join(", ") || "Unknown"}\n\nFiles by directory:\n`;
  for (const [dir, files] of grouped) {
    input += `\n## ${dir}/ (${files.length} files)\n`;
    for (const f of files.slice(0, 30)) {
      input += `- ${f.path} [${f.category}, importance: ${f.importance}]: ${f.summary}\n`;
      if (f.tags.length > 0) input += `  tags: ${f.tags.join(", ")}\n`;
    }
    if (files.length > 30) input += `  ... and ${files.length - 30} more files\n`;
  }

  const truncated = input.length > 25_000 ? input.slice(0, 25_000) + "\n... (truncated)" : input;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ARCHITECTURE_ANALYSIS_PROMPT },
      { role: "user", content: truncated },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as ArchitectureAnalysis;
    if (!Array.isArray(parsed.layers) || parsed.layers.length === 0) return null;

    return {
      layers: parsed.layers.map((l) => ({
        name: l.name ?? "Unknown",
        slug: l.slug ?? l.name?.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
        description: l.description ?? "",
        file_paths: Array.isArray(l.file_paths) ? l.file_paths : [],
        confidence: Math.min(1, Math.max(0, Number(l.confidence) || 0.5)),
      })),
      cross_cutting: Array.isArray(parsed.cross_cutting) ? parsed.cross_cutting : [],
      dependency_graph: Array.isArray(parsed.dependency_graph) ? parsed.dependency_graph : [],
      architecture_style: parsed.architecture_style ?? "monolith",
      summary: parsed.summary ?? "",
    };
  } catch {
    return null;
  }
}

/* ─── graph review and validation (multi-agent Phase 4) ─── */

const GRAPH_REVIEW_PROMPT = `You are a senior engineer reviewing a code knowledge graph for quality.
Given graph statistics and a sample of nodes/edges, assess quality and suggest fixes.

Check for:
1. Coverage: Are all major areas of the codebase represented?
2. Balance: Are layers roughly balanced, or is one layer overloaded?
3. Connectivity: Are there orphan nodes with no edges?
4. Naming: Are feature/node names meaningful and consistent?
5. Layer coherence: Do files in the same layer share a clear theme?

Return ONLY valid JSON:
{
  "approved": true | false,
  "quality_score": 0-100,
  "issues": [
    { "severity": "critical" | "warning" | "info", "message": "...", "affected_nodes": ["node_id1"] }
  ],
  "suggestions": ["Suggestion for improvement 1", "Suggestion 2"],
  "stats_check": {
    "total_nodes_ok": true,
    "edge_density_ok": true,
    "layer_coverage_ok": true,
    "orphan_rate_acceptable": true
  }
}`;

export interface GraphReviewIssue {
  severity: "critical" | "warning" | "info";
  message: string;
  affected_nodes?: string[];
}

export interface GraphReview {
  approved: boolean;
  quality_score: number;
  issues: GraphReviewIssue[];
  suggestions: string[];
  stats_check: Record<string, boolean>;
}

/**
 * LLM-powered graph quality review. Takes graph statistics and samples
 * to assess completeness, balance, and quality.
 *
 * This is the "Reviewer" agent in the multi-agent scan pipeline.
 */
export async function reviewGraph(
  projectName: string,
  stats: {
    total_nodes: number;
    total_edges: number;
    total_layers: number;
    node_types: Record<string, number>;
    edge_types: Record<string, number>;
    layer_stats: Array<{ name: string; file_count: number }>;
    orphan_count: number;
    dangling_edges: number;
  },
  sampleNodes: Array<{ name: string; type: string; layer: string; summary: string }>,
  sampleEdges: Array<{ source: string; target: string; type: string }>,
): Promise<GraphReview | null> {
  const openai = getOpenAIClient();

  const input = `Project: ${projectName}

Graph Statistics:
- Nodes: ${stats.total_nodes} (${Object.entries(stats.node_types).map(([k, v]) => `${k}: ${v}`).join(", ")})
- Edges: ${stats.total_edges} (${Object.entries(stats.edge_types).map(([k, v]) => `${k}: ${v}`).join(", ")})
- Layers: ${stats.total_layers}
- Orphan nodes (no edges): ${stats.orphan_count}
- Dangling edges (missing targets): ${stats.dangling_edges}

Layer breakdown:
${stats.layer_stats.map((l) => `- ${l.name}: ${l.file_count} files`).join("\n")}

Sample nodes (${Math.min(sampleNodes.length, 20)} of ${stats.total_nodes}):
${sampleNodes.slice(0, 20).map((n) => `- [${n.type}] ${n.name} (${n.layer}): ${n.summary}`).join("\n")}

Sample edges (${Math.min(sampleEdges.length, 20)} of ${stats.total_edges}):
${sampleEdges.slice(0, 20).map((e) => `- ${e.source} --${e.type}--> ${e.target}`).join("\n")}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4.1-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: GRAPH_REVIEW_PROMPT },
      { role: "user", content: input },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as GraphReview;
    return {
      approved: parsed.approved ?? true,
      quality_score: Math.min(100, Math.max(0, Number(parsed.quality_score) || 50)),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      stats_check: parsed.stats_check ?? {},
    };
  } catch {
    return null;
  }
}

/* ─── analyze git diff ─── */

const DIFF_ANALYSIS_PROMPT = `You are analyzing a git diff for a codebase context management system.
Given a set of uncommitted code changes, extract what has changed at a feature level.

For each logical change group, output:
- feature_name: The high-level feature this change belongs to
- summary: What changed and why (2-3 sentences)
- category: one of "core" | "ui" | "data" | "infra" | "integration"
- importance: 1-10
- files_changed: list of files in this change group

Return a JSON array. Return ONLY valid JSON. No preamble.`;

export interface DiffAnalysis {
  feature_name: string;
  summary: string;
  category: string;
  importance: number;
  files_changed: string[];
}

export async function analyzeDiff(diff: string): Promise<DiffAnalysis[]> {
  const openai = getOpenAIClient();

  const truncated = diff.length > 20_000 ? diff.slice(0, 20_000) + "\n... (truncated)" : diff;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: DIFF_ANALYSIS_PROMPT },
      { role: "user", content: truncated },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : parsed.changes ?? [];
    return arr.filter((c: DiffAnalysis) => c.feature_name && c.summary);
  } catch {
    return [];
  }
}
