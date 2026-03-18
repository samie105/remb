"use server";

import { createAdminClient } from "@/lib/supabase/server";
import type { ProjectRow, FeatureRow, UserRow, ContextEntryRow, Json } from "@/lib/supabase/types";
import { getSession } from "@/lib/auth";

/* ─── helpers ─── */

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Resolve the current user from the session, or throw. */
async function requireUser(): Promise<UserRow> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.dbUser;
}

/* ─── user ─── */

export async function getOrCreateUser(
  githubLogin: string,
  githubAvatar: string | null
): Promise<UserRow> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("users")
    .upsert(
      { github_login: githubLogin, github_avatar: githubAvatar },
      { onConflict: "github_login", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to upsert user");
  return data;
}

/* ─── projects ─── */

export type ProjectWithCounts = ProjectRow & {
  feature_count: number;
  entry_count: number;
};

export async function getProjects(): Promise<ProjectWithCounts[]> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: projects, error } = await db
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!projects?.length) return [];

  // Fetch counts via separate queries (avoids needing Relationships in types)
  const projectIds = projects.map((p) => p.id);

  const { data: features } = await db
    .from("features")
    .select("id, project_id")
    .in("project_id", projectIds);

  const featuresByProject = new Map<string, string[]>();
  for (const f of features ?? []) {
    const list = featuresByProject.get(f.project_id) ?? [];
    list.push(f.id);
    featuresByProject.set(f.project_id, list);
  }

  const allFeatureIds = features?.map((f) => f.id) ?? [];
  const entriesByFeature = new Map<string, number>();

  if (allFeatureIds.length > 0) {
    const { data: entries } = await db
      .from("context_entries")
      .select("id, feature_id")
      .in("feature_id", allFeatureIds);

    for (const e of entries ?? []) {
      entriesByFeature.set(e.feature_id, (entriesByFeature.get(e.feature_id) ?? 0) + 1);
    }
  }

  return projects.map((p) => {
    const pFeatureIds = featuresByProject.get(p.id) ?? [];
    const entry_count = pFeatureIds.reduce((acc, fid) => acc + (entriesByFeature.get(fid) ?? 0), 0);
    return { ...p, feature_count: pFeatureIds.length, entry_count };
  });
}

export async function getProject(slug: string): Promise<ProjectRow | null> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .eq("slug", slug)
    .single();

  if (error) return null;
  return data;
}

export async function createProject(input: {
  name: string;
  description?: string;
  repoName?: string;
  repoUrl?: string;
  language?: string;
  branch?: string;
}): Promise<ProjectRow> {
  const user = await requireUser();
  const db = createAdminClient();

  const slug = toSlug(input.name);

  const { data, error } = await db
    .from("projects")
    .insert({
      user_id: user.id,
      name: input.name,
      slug,
      description: input.description ?? null,
      repo_name: input.repoName ?? null,
      repo_url: input.repoUrl ?? null,
      language: input.language ?? null,
      branch: input.branch ?? "main",
      status: "active",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("A project with this name already exists.");
    throw new Error(error.message);
  }

  return data;
}

export async function updateProject(
  id: string,
  input: { name?: string; description?: string; status?: string; website_url?: string | null }
): Promise<ProjectRow> {
  const user = await requireUser();
  const db = createAdminClient();

  const updates: { name?: string; description?: string; status?: string; slug?: string; website_url?: string | null } = { ...input };
  if (input.name) updates.slug = toSlug(input.name);

  const { data, error } = await db
    .from("projects")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { error } = await db
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/**
 * Clear all context entries for a project (preserves features).
 */
export async function clearProjectEntries(projectId: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  // Verify project ownership
  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) throw new Error("Project not found");

  const { data: features } = await db
    .from("features")
    .select("id")
    .eq("project_id", projectId);

  const featureIds = features?.map((f) => f.id) ?? [];
  if (featureIds.length > 0) {
    const { error } = await db
      .from("context_entries")
      .delete()
      .in("feature_id", featureIds);
    if (error) throw new Error(error.message);
  }
}

/**
 * Disconnect a GitHub repository from a project (clears repo fields).
 */
export async function disconnectRepository(projectId: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { error } = await db
    .from("projects")
    .update({
      repo_name: null,
      repo_url: null,
      scan_on_push: false,
    })
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/**
 * Update the ignore patterns for a project (newline-separated path prefixes/globs).
 * These are merged with any .rembignore in the repo during scans.
 */
export async function updateIgnorePatterns(
  projectId: string,
  patterns: string
): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { error } = await db
    .from("projects")
    .update({ ignore_patterns: patterns || null })
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/* ─── features ─── */

export type FeatureWithCounts = FeatureRow & { entry_count: number; source_files: string[] };

export async function getFeatures(projectId: string): Promise<FeatureWithCounts[]> {
  const db = createAdminClient();

  const { data: features, error } = await db
    .from("features")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!features?.length) return [];

  const featureIds = features.map((f) => f.id);
  const { data: entries } = await db
    .from("context_entries")
    .select("id, feature_id, metadata")
    .in("feature_id", featureIds);

  const countMap = new Map<string, number>();
  const filesMap = new Map<string, Set<string>>();
  for (const e of entries ?? []) {
    countMap.set(e.feature_id, (countMap.get(e.feature_id) ?? 0) + 1);
    const meta = e.metadata as Record<string, unknown> | null;
    if (meta?.file_path && typeof meta.file_path === "string") {
      if (!filesMap.has(e.feature_id)) filesMap.set(e.feature_id, new Set());
      filesMap.get(e.feature_id)!.add(meta.file_path);
    }
  }

  return features.map((f) => ({
    ...f,
    entry_count: countMap.get(f.id) ?? 0,
    source_files: [...(filesMap.get(f.id) ?? [])],
  }));
}

export async function createFeature(
  projectId: string,
  input: { name: string; description?: string }
): Promise<FeatureRow> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("features")
    .insert({
      project_id: projectId,
      name: input.name,
      description: input.description ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateFeature(
  id: string,
  input: { name?: string; description?: string; status?: string }
): Promise<FeatureRow> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("features")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteFeature(id: string): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from("features").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ─── context entries ─── */

export async function getContextEntries(featureId: string): Promise<ContextEntryRow[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("context_entries")
    .select("*")
    .eq("feature_id", featureId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createContextEntry(input: {
  featureId: string;
  content: string;
  entryType?: string;
  source?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<ContextEntryRow> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("context_entries")
    .insert({
      feature_id: input.featureId,
      content: input.content,
      entry_type: input.entryType ?? "manual",
      source: input.source ?? "web",
      metadata: (input.metadata ?? {}) as Json,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteContextEntry(id: string): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from("context_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ─── feature detail with context entries ─── */

export type FeatureDetail = FeatureRow & {
  entries: Array<{
    id: string;
    content: string;
    entry_type: string;
    source: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};

export async function getFeatureDetail(featureId: string): Promise<FeatureDetail | null> {
  const db = createAdminClient();

  const { data: feature, error } = await db
    .from("features")
    .select("*")
    .eq("id", featureId)
    .single();

  if (error || !feature) return null;

  const { data: entries } = await db
    .from("context_entries")
    .select("id, content, entry_type, source, metadata, created_at")
    .eq("feature_id", featureId)
    .order("created_at", { ascending: false });

  return {
    ...feature,
    entries: (entries ?? []).map((e) => ({
      ...e,
      metadata: (e.metadata ?? {}) as Record<string, unknown>,
    })),
  };
}

/* ─── visualizer data ─── */

import type { FeatureCategory } from "@/lib/importance-tiers";

export type VisualizerFeature = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  category: FeatureCategory;
  importance: number;
  entry_count: number;
  files: string[];
  dependencies: string[];
  tags: string[];
  key_decisions: string[];
  gotchas: string[];
};

export type FeatureGroup = {
  category: FeatureCategory;
  label: string;
  description: string;
  features: VisualizerFeature[];
  /** Average importance of features in this group */
  avgImportance: number;
};

const CATEGORY_META: Record<FeatureCategory, { label: string; description: string }> = {
  core: { label: "Core Features", description: "Essential product features and business logic" },
  ui: { label: "UI & Components", description: "User interface, design system, and visual components" },
  data: { label: "Data & Storage", description: "Database schemas, state management, and data flow" },
  infra: { label: "Infrastructure", description: "Build tools, deployment, configuration, and DevOps" },
  integration: { label: "Integrations", description: "Third-party APIs, webhooks, and external services" },
};

export async function getVisualizerFeatures(projectId: string): Promise<FeatureGroup[]> {
  const db = createAdminClient();

  const { data: features } = await db
    .from("features")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (!features?.length) return [];

  const featureIds = features.map((f) => f.id);
  const { data: entries } = await db
    .from("context_entries")
    .select("id, feature_id, metadata, content")
    .in("feature_id", featureIds);

  const allFeatures: VisualizerFeature[] = features.map((f) => {
    const fEntries = (entries ?? []).filter((e) => e.feature_id === f.id);
    const files = [...new Set(fEntries.map((e) => (e.metadata as Record<string, unknown>)?.file_path as string).filter(Boolean))];
    const allDeps: string[] = [];
    const allTags: string[] = [];
    const allDecisions: string[] = [];
    const allGotchas: string[] = [];
    const categoryCounts = new Map<FeatureCategory, number>();
    const importanceValues: number[] = [];

    for (const e of fEntries) {
      const meta = e.metadata as Record<string, unknown> | null;
      if (Array.isArray(meta?.dependencies)) allDeps.push(...(meta.dependencies as string[]));
      if (Array.isArray(meta?.tags)) allTags.push(...(meta.tags as string[]));
      if (meta?.category && typeof meta.category === "string") {
        const c = meta.category as FeatureCategory;
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
      if (meta?.importance && typeof meta.importance === "number") {
        importanceValues.push(meta.importance as number);
      }

      try {
        const parsed = JSON.parse(e.content);
        if (Array.isArray(parsed.dependencies)) allDeps.push(...parsed.dependencies);
        if (Array.isArray(parsed.tags)) allTags.push(...parsed.tags);
        if (Array.isArray(parsed.key_decisions)) allDecisions.push(...parsed.key_decisions);
        if (Array.isArray(parsed.gotchas)) allGotchas.push(...parsed.gotchas);
        if (parsed.category && typeof parsed.category === "string") {
          const c = parsed.category as FeatureCategory;
          categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
        }
        if (typeof parsed.importance === "number") {
          importanceValues.push(parsed.importance);
        }
      } catch { /* ignore */ }
    }

    let category: FeatureCategory = "core";
    let maxVotes = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxVotes || (count === maxVotes && cat !== "core")) {
        category = cat;
        maxVotes = count;
      }
    }
    const importance = importanceValues.length > 0
      ? Math.round(importanceValues.reduce((s, v) => s + v, 0) / importanceValues.length)
      : 5;

    return {
      id: f.id,
      name: f.name,
      description: f.description,
      status: f.status,
      category,
      importance,
      entry_count: fEntries.length,
      files,
      dependencies: [...new Set(allDeps)],
      tags: [...new Set(allTags)],
      key_decisions: [...new Set(allDecisions)],
      gotchas: [...new Set(allGotchas)],
    };
  });

  // Group by category
  const groupMap = new Map<FeatureCategory, VisualizerFeature[]>();
  for (const f of allFeatures) {
    const list = groupMap.get(f.category) ?? [];
    list.push(f);
    groupMap.set(f.category, list);
  }

  // Build groups sorted by avg importance (highest first)
  const groups: FeatureGroup[] = [];
  for (const [cat, feats] of groupMap) {
    const sorted = feats.sort((a, b) => b.importance - a.importance);
    const avg = sorted.reduce((s, f) => s + f.importance, 0) / sorted.length;
    const meta = CATEGORY_META[cat] ?? { label: cat, description: "" };
    groups.push({ category: cat, label: meta.label, description: meta.description, features: sorted, avgImportance: avg });
  }

  return groups.sort((a, b) => b.avgImportance - a.avgImportance);
}

/* ─── project structure graph (for visualizer) ─── */

export type FileNodeType = "route" | "api" | "component" | "lib" | "hook" | "config" | "style" | "other";

export type StructureNode = {
  id: string;
  path: string;
  label: string;
  nodeType: FileNodeType;
  /** Route path for routes, e.g. "/dashboard/settings" */
  routePath?: string;
  features: string[];
  /** How many distinct features reference this file — drives node size */
  featureCount: number;
  category?: FeatureCategory;
  importance?: number;
};

export type StructureEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** What connects the two nodes */
  relation: "import" | "dynamic" | "re-export" | "feature" | "shared";
  /** Strength of connection — drives edge thickness + link distance */
  weight: number;
  /** Symbols imported across this edge */
  importedSymbols?: string[];
};

export type ProjectStructureGraph = {
  nodes: StructureNode[];
  edges: StructureEdge[];
};

function classifyFile(path: string): { nodeType: FileNodeType; routePath?: string } {
  const parts = path.split("/");

  // Next.js app router routes
  if (parts[0] === "app") {
    const filename = parts[parts.length - 1];
    if (filename === "page.tsx" || filename === "page.ts" || filename === "page.jsx" || filename === "page.js") {
      const routeParts = parts.slice(1, -1).filter((p) => !p.startsWith("_") && !p.startsWith("("));
      const routePath = "/" + routeParts.join("/");
      return { nodeType: "route", routePath: routePath === "/" ? "/" : routePath };
    }
    if (filename === "route.tsx" || filename === "route.ts" || filename === "route.js") {
      const routeParts = parts.slice(1, -1).filter((p) => !p.startsWith("_") && !p.startsWith("("));
      return { nodeType: "api", routePath: "/api/" + routeParts.filter((p) => p !== "api").join("/") };
    }
    if (filename === "layout.tsx" || filename === "layout.ts") return { nodeType: "config" };
    // Other files in app/ are components or helpers
    return { nodeType: "component" };
  }

  if (parts[0] === "components") return { nodeType: "component" };
  if (parts[0] === "hooks") return { nodeType: "hook" };
  if (parts[0] === "lib") return { nodeType: "lib" };
  if (path.endsWith(".css") || path.endsWith(".scss")) return { nodeType: "style" };
  if (["next.config.ts", "tailwind.config.ts", "tsconfig.json", "postcss.config.mjs"].includes(path))
    return { nodeType: "config" };

  return { nodeType: "other" };
}

export async function getProjectStructureGraph(projectId: string): Promise<ProjectStructureGraph> {
  const db = createAdminClient();

  // ── Parallel fetch: features, entries, and real import dependencies ──
  const [featuresRes, depsRes] = await Promise.all([
    db.from("features").select("id, name").eq("project_id", projectId),
    db.from("file_dependencies").select("source_path, target_path, import_type, imported_symbols").eq("project_id", projectId),
  ]);

  const features = featuresRes.data ?? [];
  const deps = depsRes.data ?? [];

  // If no features AND no deps, nothing to show
  if (!features.length && !deps.length) return { nodes: [], edges: [] };

  // Fetch context entries for feature metadata on nodes
  let entries: { id: string; feature_id: string; metadata: unknown; content: string | null }[] = [];
  if (features.length) {
    const featureIds = features.map((f) => f.id);
    const { data } = await db
      .from("context_entries")
      .select("id, feature_id, metadata, content")
      .in("feature_id", featureIds);
    entries = data ?? [];
  }

  const featureNameMap = new Map(features.map((f) => [f.id, f.name]));

  // Group files by feature, collect metadata per file
  const fileFeatures = new Map<string, Set<string>>();
  const fileCategory = new Map<string, FeatureCategory>();
  const fileImportance = new Map<string, number>();

  for (const entry of entries) {
    const meta = entry.metadata as Record<string, unknown> | null;
    const filePath = (meta?.file_path as string) ?? null;
    if (!filePath) continue;

    const featureName = featureNameMap.get(entry.feature_id) ?? "Unknown";
    if (!fileFeatures.has(filePath)) fileFeatures.set(filePath, new Set());
    fileFeatures.get(filePath)!.add(featureName);

    if (meta?.category) fileCategory.set(filePath, meta.category as FeatureCategory);
    if (meta?.importance && typeof meta.importance === "number") {
      fileImportance.set(filePath, Math.max(fileImportance.get(filePath) ?? 0, meta.importance));
    }
  }

  // ── Collect all file paths that appear in either features or dependencies ──
  const allPaths = new Set<string>();
  for (const path of fileFeatures.keys()) allPaths.add(path);
  for (const d of deps) {
    allPaths.add(d.source_path);
    allPaths.add(d.target_path);
  }

  // Count how many files import each target (for hub detection)
  const importedByCount = new Map<string, number>();
  for (const d of deps) {
    importedByCount.set(d.target_path, (importedByCount.get(d.target_path) ?? 0) + 1);
  }

  // ── Build nodes ──
  const nodes: StructureNode[] = [];
  for (const path of allPaths) {
    const { nodeType, routePath } = classifyFile(path);
    const parts = path.split("/");
    const rawLabel = parts[parts.length - 1];
    const label = rawLabel.replace(/\.(tsx?|jsx?|css|scss|mjs|cjs|json)$/, "");

    const featureNames = fileFeatures.get(path) ?? new Set<string>();
    const inboundCount = importedByCount.get(path) ?? 0;

    nodes.push({
      id: path,
      path,
      label,
      nodeType,
      routePath,
      features: [...featureNames],
      // featureCount now reflects importance: features + how many files import this one
      featureCount: featureNames.size + Math.floor(inboundCount / 2),
      category: fileCategory.get(path),
      importance: fileImportance.get(path),
    });
  }

  // ── Build edges — import dependencies are primary ──
  const edgeMap = new Map<string, StructureEdge>();

  // 1. Real import edges from file_dependencies
  for (const d of deps) {
    const key = `${d.source_path}→${d.target_path}`;
    const importType = d.import_type as "static" | "dynamic" | "re-export" | "side-effect";
    const relation = importType === "dynamic" ? "dynamic" as const
      : importType === "re-export" ? "re-export" as const
      : "import" as const;

    const existing = edgeMap.get(key);
    if (existing) {
      // Merge symbols if same edge seen (shouldn't happen with unique constraint, but safe)
      existing.weight++;
      if (d.imported_symbols?.length) {
        existing.importedSymbols = [...new Set([...(existing.importedSymbols ?? []), ...d.imported_symbols])];
      }
    } else {
      edgeMap.set(key, {
        id: key,
        source: d.source_path,
        target: d.target_path,
        relation,
        weight: 2, // import edges start at weight 2 (stronger than feature edges)
        importedSymbols: d.imported_symbols ?? undefined,
      });
    }
  }

  // 2. Feature co-occurrence edges (secondary — only where no import edge exists)
  const featureFiles = new Map<string, string[]>();
  for (const [path, featureNames] of fileFeatures) {
    for (const fname of featureNames) {
      if (!featureFiles.has(fname)) featureFiles.set(fname, []);
      featureFiles.get(fname)!.push(path);
    }
  }

  for (const [featureName, files] of featureFiles) {
    if (files.length < 2) continue;

    const byType = new Map<FileNodeType, string[]>();
    for (const f of files) {
      const { nodeType } = classifyFile(f);
      if (!byType.has(nodeType)) byType.set(nodeType, []);
      byType.get(nodeType)!.push(f);
    }

    // Cross-tier feature edges (only where no import edge already exists)
    const tiers: FileNodeType[][] = [
      ["route", "api"],
      ["component"],
      ["lib", "hook"],
    ];

    for (let i = 0; i < tiers.length - 1; i++) {
      const sources = tiers[i].flatMap((t) => byType.get(t) ?? []);
      const targets = tiers[i + 1].flatMap((t) => byType.get(t) ?? []);

      for (const src of sources) {
        for (const tgt of targets) {
          const importKey = `${src}→${tgt}`;
          const reverseKey = `${tgt}→${src}`;
          // Skip if an import edge already covers this relationship
          if (edgeMap.has(importKey) || edgeMap.has(reverseKey)) continue;

          const key = `feat:${src}→${tgt}`;
          const existing = edgeMap.get(key);
          if (existing) {
            existing.weight++;
          } else {
            edgeMap.set(key, { id: key, source: src, target: tgt, label: featureName, relation: "feature", weight: 1 });
          }
        }
      }
    }
  }

  // Mark shared — files imported by multiple routes
  const routeNodes = new Set(
    nodes.filter((n) => n.nodeType === "route" || n.nodeType === "api").map((n) => n.id),
  );
  for (const [, edge] of edgeMap) {
    if (edge.relation !== "import") continue;
    // If this file is imported by multiple routes, mark those edges as "shared"
    const targetInbound = deps.filter((d) => d.target_path === edge.target);
    const routeImporters = targetInbound.filter((d) => routeNodes.has(d.source_path));
    if (routeImporters.length >= 2) {
      edge.relation = "shared";
    }
  }

  const edges = [...edgeMap.values()];
  return { nodes, edges };
}

/* ─── importance-grouped features ─── */

import {
  type ImportanceTier,
  type TieredFeature,
  type ImportanceGroup,
  TIER_META,
  getTier,
} from "@/lib/importance-tiers";

// Types and utilities available from @/lib/importance-tiers directly

export async function getImportanceGroupedFeatures(projectId: string): Promise<ImportanceGroup[]> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const db = createAdminClient();

  const { data: features } = await db
    .from("features")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (!features?.length) return [];

  const featureIds = features.map((f) => f.id);
  const { data: entries } = await db
    .from("context_entries")
    .select("id, feature_id, metadata, content")
    .in("feature_id", featureIds);

  const tieredFeatures: TieredFeature[] = features.map((f) => {
    const fEntries = (entries ?? []).filter((e) => e.feature_id === f.id);
    const files = [...new Set(
      fEntries
        .map((e) => (e.metadata as Record<string, unknown>)?.file_path as string)
        .filter(Boolean)
    )];

    const allDeps: string[] = [];
    const allTags: string[] = [];
    const allDecisions: string[] = [];
    const allGotchas: string[] = [];
    const categoryCounts = new Map<FeatureCategory, number>();
    const importanceValues: number[] = [];

    for (const e of fEntries) {
      const meta = e.metadata as Record<string, unknown> | null;
      if (Array.isArray(meta?.dependencies)) allDeps.push(...(meta.dependencies as string[]));
      if (Array.isArray(meta?.tags)) allTags.push(...(meta.tags as string[]));
      if (meta?.category && typeof meta.category === "string") {
        const c = meta.category as FeatureCategory;
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
      if (meta?.importance && typeof meta.importance === "number") {
        importanceValues.push(meta.importance as number);
      }

      try {
        const parsed = JSON.parse(e.content);
        if (Array.isArray(parsed.dependencies)) allDeps.push(...parsed.dependencies);
        if (Array.isArray(parsed.tags)) allTags.push(...parsed.tags);
        if (Array.isArray(parsed.key_decisions)) allDecisions.push(...parsed.key_decisions);
        if (Array.isArray(parsed.gotchas)) allGotchas.push(...parsed.gotchas);
        if (parsed.category && typeof parsed.category === "string") {
          const c = parsed.category as FeatureCategory;
          categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
        }
        if (typeof parsed.importance === "number") {
          importanceValues.push(parsed.importance);
        }
      } catch { /* ignore */ }
    }

    let category: FeatureCategory = "core";
    let maxVotes = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxVotes || (count === maxVotes && cat !== "core")) {
        category = cat;
        maxVotes = count;
      }
    }
    const importance = importanceValues.length > 0
      ? Math.round(importanceValues.reduce((s, v) => s + v, 0) / importanceValues.length)
      : 5;

    return {
      id: f.id,
      name: f.name,
      description: f.description,
      status: f.status,
      category,
      importance,
      entry_count: fEntries.length,
      files,
      dependencies: [...new Set(allDeps)],
      tags: [...new Set(allTags)],
      key_decisions: [...new Set(allDecisions)],
      gotchas: [...new Set(allGotchas)],
    };
  });

  const groupMap = new Map<ImportanceTier, TieredFeature[]>();
  for (const f of tieredFeatures) {
    const tier = getTier(f.importance);
    const list = groupMap.get(tier) ?? [];
    list.push(f);
    groupMap.set(tier, list);
  }

  const tierOrder: ImportanceTier[] = ["critical", "high", "medium", "low"];
  const groups: ImportanceGroup[] = [];

  for (const tier of tierOrder) {
    const feats = groupMap.get(tier);
    if (!feats?.length) continue;

    const sorted = feats.sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));
    const avg = sorted.reduce((s, f) => s + f.importance, 0) / sorted.length;
    const meta = TIER_META[tier];

    groups.push({
      tier,
      label: meta.label,
      description: meta.description,
      color: meta.color,
      bg: meta.bg,
      features: sorted,
      avgImportance: avg,
    });
  }

  return groups;
}
