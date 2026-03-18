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

/* ─── types ─── */

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
  filename: string
): Promise<ExtractedFeature | null> {
  const openai = getOpenAIClient();

  // Truncate very large files to avoid token limits
  const maxChars = 12_000;
  const truncated = content.length > maxChars
    ? content.slice(0, maxChars) + "\n// ... truncated"
    : content;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SCANNING_PROMPT },
      { role: "user", content: `File: ${filename}\n\nCode:\n${truncated}` },
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
