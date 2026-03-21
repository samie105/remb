import { NextRequest } from "next/server";
import OpenAI from "openai";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getFileContent } from "@/lib/github-reader";
import { assembleContext, type ScoredItem } from "@/lib/context-assembler";
import { getEntityNeighborhood, getRelatedEntities, getFeatureKnowledgeGraph } from "@/lib/graph-actions";

/* ─── context loader ─── */

async function loadProjectContext(projectId: string, userId: string, userQuery?: string) {
  const db = createAdminClient();

  const { data: latestScan } = await db
    .from("scan_jobs")
    .select("result")
    .eq("project_id", projectId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const scanResult = latestScan?.result as Record<string, unknown> | null;
  const techStack = Array.isArray(scanResult?.tech_stack)
    ? (scanResult.tech_stack as string[])
    : [];
  const languages = (scanResult?.languages ?? {}) as Record<string, number>;

  // Use intelligent retrieval when we have a user query
  let assembledItems: ScoredItem[] = [];
  let memories: Array<{ tier: string; category: string; title: string; content: string }> = [];

  try {
    const assembled = await assembleContext({
      userId,
      projectId,
      query: userQuery,
      tokenBudget: 12000, // chat gets 12K for context, leaving room for system prompt
    });
    assembledItems = assembled.items;

    // Extract memories from assembled items for backward compat with buildProjectBlock
    memories = assembled.items
      .filter((i) => i.kind === "memory")
      .map((i) => ({ tier: i.tier ?? "active", category: i.category ?? "general", title: i.title, content: i.content }));
  } catch {
    // Fallback to static loading if assembler fails
    const { data } = await db
      .from("memories")
      .select("tier, category, title, content")
      .eq("user_id", userId)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .in("tier", ["core", "active"])
      .order("tier")
      .order("access_count", { ascending: false })
      .limit(40);
    memories = data ?? [];
  }

  const { data: features } = await db
    .from("features")
    .select("id, name, description, status")
    .eq("project_id", projectId)
    .eq("status", "active")
    .limit(30);

  // File dependency graph (compact)
  const { data: deps } = await db
    .from("file_dependencies")
    .select("source_path, target_path, import_type")
    .eq("project_id", projectId)
    .limit(150);

  // Include conversation snippets from assembled results
  const conversations = assembledItems
    .filter((i) => i.kind === "conversation")
    .slice(0, 5);

  return { techStack, languages, memories, features: features ?? [], deps: deps ?? [], conversations };
}

function buildProjectBlock(
  project: { name: string; description: string | null; language: string | null; repo_name?: string | null },
  ctx: Awaited<ReturnType<typeof loadProjectContext>>,
): string {
  const lines: string[] = [];
  lines.push(`### ${project.name}`);
  if (project.description) lines.push(`> ${project.description}`);
  if (project.language) lines.push(`Language: ${project.language}`);
  if (project.repo_name) lines.push(`Repo: ${project.repo_name}`);
  if (ctx.techStack.length > 0) lines.push(`Tech Stack: ${ctx.techStack.join(", ")}`);

  const topLangs = Object.entries(ctx.languages).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (topLangs.length > 0) lines.push(`Languages: ${topLangs.map(([l, c]) => `${l} (${c})`).join(", ")}`);

  const coreMemories = ctx.memories.filter((m) => m.tier === "core");
  if (coreMemories.length > 0) {
    lines.push("", "**Core Knowledge:**");
    for (const m of coreMemories) {
      lines.push(`- **${m.title}** (${m.category}): ${m.content.slice(0, 300)}`);
    }
  }

  const activeMemories = ctx.memories.filter((m) => m.tier === "active");
  if (activeMemories.length > 0) {
    lines.push("", "**Active Memories:**");
    for (const m of activeMemories.slice(0, 10)) {
      lines.push(`- **${m.title}** (${m.category}): ${m.content.slice(0, 200)}`);
    }
  }

  if (ctx.features.length > 0) {
    lines.push("", "**Features:**");
    for (const f of ctx.features.slice(0, 20)) {
      lines.push(`- ${f.name}: ${f.description ?? "No description"}`);
    }
  }

  if (ctx.conversations && ctx.conversations.length > 0) {
    lines.push("", "**Relevant Recent Conversations:**");
    for (const c of ctx.conversations) {
      lines.push(`- ${c.title}: ${c.content.slice(0, 200)}`);
    }
  }

  if (ctx.deps.length > 0) {
    const bySource = new Map<string, string[]>();
    for (const d of ctx.deps) {
      if (!bySource.has(d.source_path)) bySource.set(d.source_path, []);
      bySource.get(d.source_path)!.push(d.target_path);
    }
    lines.push("", "**Key File Dependencies:**");
    for (const [source, targets] of [...bySource.entries()].slice(0, 15)) {
      lines.push(`- ${source} → ${targets.join(", ")}`);
    }
  }

  return lines.join("\n");
}

/* ─── resolve project from current path ─── */

async function resolveProjectFromPath(
  currentPath: string | undefined,
  userId: string,
): Promise<{ id: string; name: string; slug: string; description: string | null; language: string | null; repo_name: string | null } | null> {
  if (!currentPath) return null;
  // Match /dashboard/[slug] or /dashboard/[slug]/...
  const match = currentPath.match(/^\/dashboard\/([^/]+)/);
  if (!match) return null;
  const slug = match[1];
  if (slug === "settings") return null;

  const db = createAdminClient();
  const { data } = await db
    .from("projects")
    .select("id, name, slug, description, language, repo_name")
    .eq("user_id", userId)
    .eq("slug", slug)
    .single();

  return data;
}

/* ─── tools ─── */

const CHAT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "change_theme",
      description: "Change the app's color theme. Use when the user asks to switch to dark mode, light mode, or system theme.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["dark", "light", "system"], description: "The theme mode" },
        },
        required: ["mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Navigate to a page. Routes: /dashboard, /dashboard/[slug], /dashboard/[slug]/plan, /dashboard/[slug]/scan, /dashboard/[slug]/context, /dashboard/[slug]/features, /dashboard/settings.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The route path to navigate to" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_context",
      description: "Load detailed context for a project by ID — tech stack, memories, features, dependencies. Use when you want to answer questions about a specific project. If you already know the project from the current page context, use its ID directly.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The project UUID" },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_projects",
      description: "Search the user's projects by name, slug, or keyword. Use when the user mentions a project name you don't recognize or when you need to find a project. Also searches descriptions.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_across_projects",
      description: "Search for files, features, and context entries across ALL projects. Use when the user asks about specific files, code patterns, or features without specifying which project.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "File path fragment or keyword (e.g. 'auth', 'dashboard/page')" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_plan",
      description: "Create a new plan for a project. Use when the user wants to plan a feature, refactor, migration, or any structured work.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Project UUID" },
          title: { type: "string", description: "Plan title" },
          description: { type: "string", description: "Brief plan description" },
        },
        required: ["project_id", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_phase",
      description: "Create a new phase/milestone in a plan.",
      parameters: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "Plan UUID" },
          title: { type: "string", description: "Phase title" },
          description: { type: "string", description: "Phase description" },
        },
        required: ["plan_id", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_plans",
      description: "List all plans for a specific project, or all plans if no project specified.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Optional project UUID to filter by" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_knowledge_graph",
      description: "Traverse the project's knowledge graph from any entity. Returns related memories, features, conversations, and their relationships. Use when the user asks about connections, dependencies, or what relates to something.",
      parameters: {
        type: "object",
        properties: {
          entity_type: { type: "string", enum: ["memory", "context_entry", "feature", "conversation", "plan"], description: "Entity type to start from" },
          entity_id: { type: "string", description: "Entity ID to start from" },
          max_hops: { type: "number", description: "Traversal depth (1-4, default: 2)" },
          relation: { type: "string", enum: ["depends_on", "informs", "contradicts", "extends", "derived_from", "references", "implements", "tests"], description: "Filter by relation type" },
        },
        required: ["entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_memories",
      description: "Semantic search across the user's memories. Returns the most relevant memories for a query. Use when the user asks to recall past decisions, patterns, or knowledge.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
          project_id: { type: "string", description: "Scope to a specific project" },
          limit: { type: "number", description: "Max results (default: 10)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_impact_analysis",
      description: "Analyze what would be affected by changes to a file or feature. Uses the import dependency graph and knowledge graph to trace downstream consumers. Use when the user asks 'what would break if I change X' or 'what depends on Y'.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Project UUID" },
          file_path: { type: "string", description: "File path to analyze (e.g. 'lib/auth.ts')" },
          feature_name: { type: "string", description: "Feature name to analyze (alternative to file_path)" },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_thread_history",
      description: "Get conversation thread history — past discussions related to the current topic. Use when the user references a previous conversation or wants to continue where they left off.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Topic to find related conversation threads for" },
          project_id: { type: "string", description: "Scope to a specific project" },
          limit: { type: "number", description: "Max entries (default: 10)" },
        },
        required: ["query"],
      },
    },
  },
];

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<{ result: string; action?: { type: string; payload?: string } }> {
  const db = createAdminClient();

  switch (toolName) {
    case "change_theme": {
      const mode = args.mode as string;
      return {
        result: `Theme changed to ${mode} mode.`,
        action: { type: "theme", payload: mode },
      };
    }
    case "navigate": {
      const path = args.path as string;
      if (!path.startsWith("/") || /[<>"';&]/.test(path)) {
        return { result: "Invalid route path." };
      }
      return {
        result: `Navigating to ${path}.`,
        action: { type: "navigate", payload: path },
      };
    }
    case "get_project_context": {
      const projectId = args.project_id as string;
      const { data: proj } = await db
        .from("projects")
        .select("id, name, slug, description, language, repo_name")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();

      if (!proj) return { result: "Project not found or you don't have access." };

      const ctx = await loadProjectContext(proj.id, userId);
      return {
        result: buildProjectBlock(
          { name: proj.name, description: proj.description, language: proj.language, repo_name: proj.repo_name },
          ctx,
        ),
      };
    }
    case "search_projects": {
      const query = args.query as string;
      const { data: projects } = await db
        .from("projects")
        .select("id, name, slug, description, language")
        .eq("user_id", userId)
        .eq("status", "active")
        .or(`name.ilike.%${query}%,slug.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(10);

      if (!projects || projects.length === 0) {
        return { result: "No projects found matching that query." };
      }
      return { result: JSON.stringify({ projects }) };
    }
    case "search_across_projects": {
      const query = (args.query as string) ?? "";
      const { data: userProjects } = await db
        .from("projects")
        .select("id, name, slug")
        .eq("user_id", userId)
        .eq("status", "active");
      const projectIds = (userProjects ?? []).map((p) => p.id);
      const projectMap = new Map((userProjects ?? []).map((p) => [p.id, p]));

      const { data: fileDeps } = projectIds.length > 0
        ? await db
            .from("file_dependencies")
            .select("source_path, project_id")
            .in("project_id", projectIds)
            .ilike("source_path", `%${query}%`)
            .limit(40)
        : { data: [] as { source_path: string; project_id: string }[] };

      const fileResults = (fileDeps ?? []).map((f) => ({
        path: f.source_path,
        project: projectMap.get(f.project_id)?.name ?? "Unknown",
        slug: projectMap.get(f.project_id)?.slug ?? "",
      }));

      const { data: featureResults } = projectIds.length > 0
        ? await db
            .from("features")
            .select("name, description, status, project_id")
            .in("project_id", projectIds)
            .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(10)
        : { data: [] as { name: string; description: string | null; status: string; project_id: string }[] };

      const features = (featureResults ?? []).map((f) => ({
        name: f.name,
        description: f.description,
        project: projectMap.get(f.project_id)?.name ?? "Unknown",
      }));

      return { result: JSON.stringify({ files: fileResults, features }) };
    }
    case "create_plan": {
      const { data: plan, error } = await db
        .from("plans")
        .insert({
          project_id: args.project_id as string,
          user_id: userId,
          title: args.title as string,
          description: (args.description as string) ?? null,
          status: "active",
        })
        .select("id, title, status")
        .single();

      if (error) return { result: `Failed to create plan: ${error.message}` };
      return { result: JSON.stringify({ success: true, plan }) };
    }
    case "create_phase": {
      const planId = args.plan_id as string;
      const { data: last } = await db
        .from("plan_phases")
        .select("sort_order")
        .eq("plan_id", planId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();
      const sortOrder = (last?.sort_order ?? -1) + 1;

      const { data, error } = await db
        .from("plan_phases")
        .insert({
          plan_id: planId,
          title: args.title as string,
          description: (args.description as string) ?? null,
          sort_order: sortOrder,
        })
        .select("id, title, status, sort_order")
        .single();

      if (error) return { result: `Failed to create phase: ${error.message}` };
      return { result: JSON.stringify({ success: true, phase: data }) };
    }
    case "list_plans": {
      const query = db
        .from("plans")
        .select("id, title, status, created_at, projects(name, slug)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(15);

      if (args.project_id) {
        query.eq("project_id", args.project_id as string);
      }

      const { data: plans } = await query;
      return { result: JSON.stringify({ plans: plans ?? [] }) };
    }
    case "query_knowledge_graph": {
      const entityType = args.entity_type as string;
      const entityId = args.entity_id as string;
      const maxHops = (args.max_hops as number) ?? 2;
      const relation = args.relation as string | undefined;

      const results = await getRelatedEntities(userId, entityType, entityId, {
        maxHops: Math.min(maxHops, 4),
        relationFilter: relation,
      });

      if (!results.length) return { result: "No related entities found in the knowledge graph." };

      const lines = results.map((r) =>
        `[hop ${r.hop}] ${r.entity_type}:${r.entity_id} via "${r.via_relation}" (confidence: ${r.confidence})`
      );
      return { result: `Knowledge graph traversal (${results.length} entities):\n${lines.join("\n")}` };
    }
    case "search_memories": {
      const queryText = args.query as string;
      const { generateEmbedding } = await import("@/lib/openai");

      let embedding: number[];
      try {
        embedding = await generateEmbedding(queryText);
      } catch {
        return { result: "Failed to generate search embedding." };
      }

      const { data } = await db.rpc("search_memories", {
        p_user_id: userId,
        p_project_id: (args.project_id as string) ?? undefined,
        query_embedding: JSON.stringify(embedding),
        match_count: (args.limit as number) ?? 10,
      });

      const memories = (data ?? []) as unknown as Array<{ id: string; title: string; content: string; tier: string; category: string; similarity: number }>;
      if (!memories.length) return { result: "No matching memories found." };

      const lines = memories.map((m) =>
        `**${m.title}** (${m.tier}/${m.category}, similarity: ${(m.similarity * 100).toFixed(0)}%): ${m.content.slice(0, 300)}`
      );
      return { result: lines.join("\n\n") };
    }
    case "get_impact_analysis": {
      const projectId = args.project_id as string;
      const filePath = args.file_path as string | undefined;
      const featureName = args.feature_name as string | undefined;

      const lines: string[] = [];

      if (filePath) {
        // Find all files that import this file (reverse dependency graph)
        const { data: consumers } = await db
          .from("file_dependencies")
          .select("source_path, import_type, imported_symbols")
          .eq("project_id", projectId)
          .eq("target_path", filePath);

        if (consumers?.length) {
          lines.push(`**${filePath}** is imported by ${consumers.length} files:`);
          for (const c of consumers) {
            const symbols = c.imported_symbols?.length ? ` (uses: ${c.imported_symbols.join(", ")})` : "";
            lines.push(`- ${c.source_path} [${c.import_type}]${symbols}`);
          }
        } else {
          lines.push(`**${filePath}** has no known consumers.`);
        }

        // Also check which features this file belongs to
        const { data: entries } = await db
          .from("context_entries")
          .select("feature_id, metadata")
          .in("feature_id", (await db.from("features").select("id").eq("project_id", projectId)).data?.map((f) => f.id) ?? []);

        const affectedFeatures = new Set<string>();
        for (const e of entries ?? []) {
          const meta = e.metadata as Record<string, unknown> | null;
          if (meta?.file_path === filePath) {
            affectedFeatures.add(e.feature_id);
          }
        }
        if (affectedFeatures.size) {
          const { data: featureRows } = await db.from("features").select("name").in("id", [...affectedFeatures]);
          lines.push(`\nAffected features: ${(featureRows ?? []).map((f) => f.name).join(", ")}`);
        }
      }

      if (featureName) {
        const { data: feature } = await db
          .from("features")
          .select("id")
          .eq("project_id", projectId)
          .ilike("name", featureName)
          .single();

        if (feature) {
          // Get knowledge graph for this feature
          const graph = await getFeatureKnowledgeGraph(userId, feature.id);
          if (graph.length) {
            lines.push(`\n**${featureName}** knowledge graph (${graph.length} connections):`);
            for (const node of graph.slice(0, 20)) {
              lines.push(`- ${node.entity_type} "${node.title ?? node.entity_id}" [${node.relation}] (${node.direction})`);
            }
          }

          // Find reverse depends_on relations
          const { data: dependents } = await db
            .from("entity_relations" as never)
            .select("source_id, metadata" as never)
            .eq("target_id" as never, feature.id as never)
            .eq("relation" as never, "depends_on" as never)
            .eq("target_type" as never, "feature" as never);

          const depIds = ((dependents ?? []) as unknown as Array<{ source_id: string }>).map((d) => d.source_id);
          if (depIds.length) {
            const { data: depFeatures } = await db.from("features").select("name").in("id", depIds);
            lines.push(`\nFeatures that depend on **${featureName}**: ${(depFeatures ?? []).map((f) => f.name).join(", ")}`);
          }
        } else {
          lines.push(`Feature "${featureName}" not found.`);
        }
      }

      return { result: lines.length ? lines.join("\n") : "No impact data found. Provide either file_path or feature_name." };
    }
    case "get_thread_history": {
      const queryText = args.query as string;
      const { generateEmbedding } = await import("@/lib/openai");
      const { searchConversationHistory } = await import("@/lib/conversation-actions");

      const results = await searchConversationHistory({
        userId,
        query: queryText,
        limit: (args.limit as number) ?? 10,
      });

      if (!results.length) return { result: "No related conversation threads found." };

      const lines = results.map((r: { content: string; created_at: string; tags?: string[] }) => {
        const date = new Date(r.created_at).toLocaleDateString();
        const tags = r.tags?.length ? ` [${r.tags.join(", ")}]` : "";
        return `**${date}**${tags}: ${r.content.slice(0, 300)}`;
      });
      return { result: `Related conversation threads:\n\n${lines.join("\n\n")}` };
    }
    default:
      return { result: `Unknown tool: ${toolName}` };
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json()) as {
    message: string;
    history?: Array<{ role: string; content: string }>;
    projectId?: string | null;
    currentPath?: string;
    contextFiles?: Array<{ path: string; projectId: string; projectName: string }>;
    uploadedFiles?: Array<{ name: string; content: string }>;
  };

  const { message, history, projectId, currentPath, contextFiles, uploadedFiles } = body;
  if (!message?.trim()) {
    return new Response("Missing message", { status: 400 });
  }

  const db = createAdminClient();
  const userId = session.dbUser.id;

  // Resolve project from the current URL path (e.g. /dashboard/my-project → my-project)
  const pathProject = await resolveProjectFromPath(currentPath, userId);

  // If the user explicitly selected a project (from project picker), use that; else use path-derived one
  const contextProject = projectId
    ? await (async () => {
        const { data } = await db
          .from("projects")
          .select("id, name, slug, description, language, repo_name")
          .eq("id", projectId)
          .eq("user_id", userId)
          .single();
        return data;
      })()
    : pathProject;

  // Load full project context if we have one
  let projectContextSection = "";
  if (contextProject) {
    const ctx = await loadProjectContext(contextProject.id, userId, message);
    projectContextSection = `\n\n## Current Project Context\n\nYou are currently viewing **${contextProject.name}**. When the user says "this project", "this", "the project", etc., they mean this one.\n\n${buildProjectBlock(
      { name: contextProject.name, description: contextProject.description, language: contextProject.language, repo_name: contextProject.repo_name },
      ctx,
    )}`;
  }

  // Load global memories
  const { data: globalMemories } = await db
    .from("memories")
    .select("tier, category, title, content")
    .eq("user_id", userId)
    .is("project_id", null)
    .in("tier", ["core", "active"])
    .order("access_count", { ascending: false })
    .limit(15);

  let globalMemorySection = "";
  if (globalMemories && globalMemories.length > 0) {
    globalMemorySection = "\n\n## User's Global Memories\n\n" +
      globalMemories.map((m) => `- **${m.title}** (${m.category}): ${m.content.slice(0, 300)}`).join("\n");
  }

  // Load all user projects for reference
  const { data: userProjects } = await db
    .from("projects")
    .select("id, name, slug")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("name")
    .limit(50);

  const projectList = (userProjects ?? [])
    .map((p) => `- ${p.name} (slug: ${p.slug}, id: ${p.id})${p.slug === contextProject?.slug ? " ← current" : ""}`)
    .join("\n");

  const systemPrompt = `You are Remb AI — a sharp, concise assistant embedded in a developer tools platform. You float as a persistent chat panel across every page.

## How you communicate
- Brief, direct, conversational. No walls of text. Short paragraphs.
- Reference actual project names, files, and features — you know this codebase.
- Use markdown naturally — code snippets, bold, short lists when they help.
- Ask clarifying questions when needed instead of guessing.

## Context awareness
${contextProject ? `The user is currently on the **${contextProject.name}** project page (${currentPath}). When they say "this project", "the project", "this", "it", etc. — they mean **${contextProject.name}** (id: ${contextProject.id}).` : `The user is on ${currentPath || "an unknown page"}. No specific project page is open. If they reference a project ambiguously, use search_projects or check the project list below.`}

## Your tools
- **get_project_context** — load full context (tech stack, memories, features, deps) for a project. Use the project ID.
- **search_projects** — find projects by name/keyword when unsure which one the user means.
- **search_across_projects** — search files and features across ALL projects.
- **change_theme** — switch dark/light/system theme. Embed action tag: \`[ACTION:theme:MODE]\`
- **navigate** — go to a page. Embed action tag: \`[ACTION:navigate:/path]\`
- **create_plan** — create a new plan for a project.
- **create_phase** — add a phase to an existing plan.
- **list_plans** — list plans for a project.
- **query_knowledge_graph** — traverse the knowledge graph from any entity. Use to find connections between features, memories, conversations, and code.
- **search_memories** — semantic search across all memories. Find past decisions, patterns, gotchas, and preferences.
- **get_impact_analysis** — analyze what code/features would be affected by changing a file or feature. Shows downstream consumers and dependencies.
- **get_thread_history** — find past conversation threads related to a topic. Use when the user references prior discussions.

## Smart behavior
1. **When the user asks about "this project"** — you ALREADY have the current project context below. ${contextProject ? `Use get_project_context with id "${contextProject.id}" if you need deeper info.` : "Ask them to specify which project or navigate to one."}
2. **When the user asks vague questions** like "what does this do" — infer from the current page context.
3. **When the user mentions a project name** — match it against the project list. If ambiguous, use search_projects.
4. **For theme/navigation actions** — embed action tags in your response (stripped by the UI):
   - Theme: \`[ACTION:theme:dark]\`, \`[ACTION:theme:light]\`, \`[ACTION:theme:system]\`
   - Navigate: \`[ACTION:navigate:/dashboard/my-project]\`
5. **When the user asks about dependencies or impact** — use get_impact_analysis to show what depends on a file or feature.
6. **When the user asks about past decisions or patterns** — use search_memories to recall relevant knowledge.
7. **When the user asks "what's related to X"** — use query_knowledge_graph to traverse entity relationships.
8. **When the user references a prior conversation** — use get_thread_history to load related context.

## User's projects
${projectList || "No projects yet."}${projectContextSection}${globalMemorySection}`;

  // Build attached file context section
  let attachedFileContext = "";
  if (contextFiles && contextFiles.length > 0) {
    attachedFileContext += "\n\n## Attached Project Files (provided by user as context)\n";
    // Group by project, fetch contents
    const byProject = new Map<string, typeof contextFiles>();
    for (const f of contextFiles.slice(0, 15)) {
      const arr = byProject.get(f.projectId) ?? [];
      arr.push(f);
      byProject.set(f.projectId, arr);
    }
    for (const [projId, files] of byProject) {
      const { data: proj } = await db
        .from("projects")
        .select("repo_name, branch, user_id")
        .eq("id", projId)
        .eq("user_id", userId)
        .single();
      const { data: userRow } = await db
        .from("users")
        .select("github_token")
        .eq("id", userId)
        .single();
      const token = userRow?.github_token;
      if (proj?.repo_name && token) {
        for (const f of files) {
          try {
            const content = await getFileContent(token, proj.repo_name, f.path);
            const truncated = content.slice(0, 6000);
            attachedFileContext += `\n### ${f.path} (from ${f.projectName})\n\`\`\`\n${truncated}${content.length > 6000 ? "\n... (truncated)" : ""}\n\`\`\`\n`;
          } catch {
            attachedFileContext += `\n### ${f.path} (from ${f.projectName})\n*Could not fetch file content*\n`;
          }
        }
      } else {
        for (const f of files) {
          attachedFileContext += `\n### ${f.path} (from ${f.projectName})\n`;
        }
      }
    }
  }
  if (uploadedFiles && uploadedFiles.length > 0) {
    attachedFileContext += "\n\n## Uploaded Files (provided by user as context)\n";
    for (const f of uploadedFiles.slice(0, 10)) {
      const truncated = f.content.slice(0, 8000);
      attachedFileContext += `\n### ${f.name}\n\`\`\`\n${truncated}${f.content.length > 8000 ? "\n... (truncated)" : ""}\n\`\`\`\n`;
    }
  }

  const fullSystemPrompt = systemPrompt + attachedFileContext;

  // Build conversation messages with history
  const conversationMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: fullSystemPrompt },
  ];

  // Add conversation history (last N messages)
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-20)) {
      if (h.role === "user" || h.role === "assistant") {
        conversationMessages.push({ role: h.role, content: h.content });
      }
    }
  }

  // Add current message
  conversationMessages.push({ role: "user", content: message });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      try {
        const currentMessages = [...conversationMessages];
        let loopCount = 0;
        const maxLoops = 8;

        while (loopCount < maxLoops) {
          loopCount++;

          const response = await openai.chat.completions.create({
            model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini",
            temperature: 0.7,
            max_tokens: 4096,
            messages: currentMessages,
            tools: CHAT_TOOLS,
            stream: true,
          });

          let accumulatedContent = "";
          const toolCalls: Array<{
            id: string;
            name: string;
            arguments: string;
          }> = [];
          let finishReason = "";

          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta;
            finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

            if (delta?.content) {
              accumulatedContent += delta.content;
              send("text", { content: delta.content });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.index !== undefined) {
                  while (toolCalls.length <= tc.index) {
                    toolCalls.push({ id: "", name: "", arguments: "" });
                  }
                  if (tc.id) toolCalls[tc.index].id = tc.id;
                  if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
                  if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
                }
              }
            }
          }

          if (finishReason !== "tool_calls" || toolCalls.length === 0) {
            break;
          }

          // Execute tool calls
          const assistantMsg: OpenAI.ChatCompletionMessageParam = {
            role: "assistant",
            content: accumulatedContent || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          };
          currentMessages.push(assistantMsg);

          for (const tc of toolCalls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.arguments) as Record<string, unknown>;
            } catch {
              /* malformed */
            }

            send("tool_call", { name: tc.name, args });

            const { result, action } = await executeTool(tc.name, args, userId);

            send("tool_result", { name: tc.name, result, action });

            currentMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            });
          }
        }

        send("done", {});
        controller.close();
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "Unknown error",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
