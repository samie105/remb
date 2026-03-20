import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * GET /api/cli/context/bundle?projectSlug=<slug>
 *
 * Returns a full project context bundle (memories, features, markdown)
 * for AI agent consumption.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const projectSlug = request.nextUrl.searchParams.get("projectSlug");
  if (!projectSlug) {
    return NextResponse.json(
      { error: "Missing required query param: projectSlug" },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Resolve project
  const { data: project } = await db
    .from("projects")
    .select("id, name, description")
    .eq("user_id", user.id)
    .eq("slug", projectSlug)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Latest scan for tech stack / languages
  const { data: latestScan } = await db
    .from("scan_jobs")
    .select("result")
    .eq("project_id", project.id)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const scanResult = latestScan?.result as Record<string, unknown> | null;
  const techStack = Array.isArray(scanResult?.tech_stack)
    ? (scanResult.tech_stack as string[])
    : [];
  const languages = (scanResult?.languages ?? {}) as Record<string, number>;

  // Memories (core first, then active — project-scoped + global)
  const { data: memories } = await db
    .from("memories")
    .select("tier, category, title, content")
    .eq("user_id", user.id)
    .or(`project_id.eq.${project.id},project_id.is.null`)
    .in("tier", ["core", "active"])
    .order("tier")
    .order("access_count", { ascending: false })
    .limit(50);

  // Features + context entries for file mapping
  const { data: features } = await db
    .from("features")
    .select("id, name, description, status")
    .eq("project_id", project.id)
    .eq("status", "active");

  const featureIds = (features ?? []).map((f) => f.id);
  const { data: entries } = featureIds.length > 0
    ? await db
        .from("context_entries")
        .select("feature_id, metadata")
        .in("feature_id", featureIds)
    : { data: [] as { feature_id: string; metadata: unknown }[] };

  // Build feature summaries with majority-vote categories
  type FeatureCategory = "core" | "ui" | "data" | "infra" | "integration";
  const featureSummaries = (features ?? []).map((f) => {
    const fEntries = (entries ?? []).filter((e) => e.feature_id === f.id);
    const files: string[] = [];
    const categoryCounts = new Map<string, number>();
    const importanceValues: number[] = [];

    for (const e of fEntries) {
      const meta = e.metadata as Record<string, unknown> | null;
      if (meta?.file_path) files.push(meta.file_path as string);
      if (meta?.category) {
        const c = meta.category as string;
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
      if (typeof meta?.importance === "number")
        importanceValues.push(meta.importance);
    }

    let category: FeatureCategory = "core";
    let maxVotes = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxVotes || (count === maxVotes && cat !== "core")) {
        category = cat as FeatureCategory;
        maxVotes = count;
      }
    }

    return {
      name: f.name,
      category,
      importance: importanceValues.length
        ? Math.round(
            importanceValues.reduce((s, v) => s + v, 0) /
              importanceValues.length,
          )
        : 5,
      description: f.description,
      files: [...new Set(files)],
    };
  }).sort((a, b) => b.importance - a.importance);

  // Filter out low-importance features to reduce token waste
  const significantFeatures = featureSummaries.filter((f) => f.importance >= 3);

  // Recent conversations for session continuity
  const { data: recentConversations } = await db
    .from("conversation_entries")
    .select("content, type, tags, created_at")
    .eq("user_id", user.id)
    .or(`project_slug.eq.${projectSlug},project_slug.is.null`)
    .order("created_at", { ascending: false })
    .limit(10);

  const conversations = (recentConversations ?? []).map((c) => ({
    content: c.content,
    type: c.type,
    tags: c.tags,
    createdAt: c.created_at,
  }));

  // File dependency graph
  const { data: deps } = await db
    .from("file_dependencies")
    .select("source_path, target_path, import_type, imported_symbols")
    .eq("project_id", project.id);

  const dependencies = (deps ?? []).map((d) => ({
    source: d.source_path,
    target: d.target_path,
    type: d.import_type,
    symbols: d.imported_symbols,
  }));

  // Token budget from plan limits
  const { data: userRow } = await db
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .single();

  const { data: planRow } = await db
    .from("plan_limits")
    .select("max_token_budget")
    .eq("plan", userRow?.plan ?? "free")
    .single();

  const tokenBudget = planRow?.max_token_budget ?? 16000;

  // Active plans with phases
  const { data: activePlans } = await db
    .from("plans")
    .select("id, title, description, status")
    .eq("project_id", project.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  const planIds = (activePlans ?? []).map((p) => p.id);
  const { data: planPhases } = planIds.length > 0
    ? await db
        .from("plan_phases")
        .select("id, plan_id, title, description, status, sort_order")
        .in("plan_id", planIds)
        .neq("status", "skipped")
        .order("sort_order", { ascending: true })
    : { data: [] as { id: string; plan_id: string; title: string; description: string | null; status: string; sort_order: number }[] };

  const phasesByPlan = new Map<string, typeof planPhases>();
  for (const phase of planPhases ?? []) {
    const list = phasesByPlan.get(phase.plan_id) ?? [];
    list.push(phase);
    phasesByPlan.set(phase.plan_id, list);
  }

  const plans = (activePlans ?? []).map((p) => ({
    title: p.title,
    description: p.description,
    phases: (phasesByPlan.get(p.id) ?? []).map((ph) => ({
      title: ph.title,
      description: ph.description,
      status: ph.status,
    })),
  }));

  // Build markdown with token budget
  const markdown = buildContextMarkdown(
    { name: project.name, description: project.description, techStack, languages },
    memories ?? [],
    significantFeatures,
    conversations,
    dependencies,
    tokenBudget,
    plans,
  );

  return NextResponse.json({
    project: {
      name: project.name,
      description: project.description,
      techStack,
      languages,
    },
    memories: (memories ?? []).map((m) => ({
      tier: m.tier,
      category: m.category,
      title: m.title,
      content: m.content,
    })),
    features: significantFeatures,
    conversations,
    dependencies,
    plans,
    tokenBudget,
    markdown,
  });
}

/* ─── Markdown builder ─── */

function buildContextMarkdown(
  project: {
    name: string;
    description: string | null;
    techStack: string[];
    languages: Record<string, number>;
  },
  memories: Array<{
    tier: string;
    category: string;
    title: string;
    content: string;
  }>,
  features: Array<{
    name: string;
    category: string;
    importance: number;
    description: string | null;
    files: string[];
  }>,
  conversations?: Array<{
    content: string;
    type: string;
    tags: string[];
    createdAt: string;
  }>,
  dependencies?: Array<{
    source: string;
    target: string;
    type: string;
    symbols: string[] | null;
  }>,
  tokenBudget = 16000,
  plans?: Array<{
    title: string;
    description: string | null;
    phases: Array<{ title: string; description: string | null; status: string }>;
  }>,
): string {
  const lines: string[] = [];
  let currentTokens = 0;

  function addLine(line: string): boolean {
    const cost = estimateTokens(line + "\n");
    if (currentTokens + cost > tokenBudget) return false;
    lines.push(line);
    currentTokens += cost;
    return true;
  }

  function addLines(newLines: string[]): boolean {
    for (const line of newLines) {
      if (!addLine(line)) return false;
    }
    return true;
  }

  addLines([
    `# ${project.name} — Project Context`,
    "",
    `> Auto-generated by Remb. Last updated: ${new Date().toISOString().slice(0, 10)}`,
    "",
  ]);

  if (project.description) {
    addLines([project.description, ""]);
  }

  if (project.techStack.length > 0) {
    addLines([`**Tech Stack:** ${project.techStack.join(", ")}`, ""]);
  }

  const langEntries = Object.entries(project.languages).sort(
    (a, b) => b[1] - a[1],
  );
  if (langEntries.length > 0) {
    addLines([
      `**Languages:** ${langEntries.map(([l, c]) => `${l} (${c})`).join(", ")}`,
      "",
    ]);
  }

  // Core memories — highest priority, always included
  const coreMemories = memories.filter((m) => m.tier === "core");
  const activeMemories = memories.filter((m) => m.tier === "active");

  if (coreMemories.length > 0) {
    addLines(["## Core Knowledge (Always Active)", ""]);
    for (const m of coreMemories) {
      if (!addLines([`### ${m.title}`, `_${m.category}_`, "", m.content, ""])) break;
    }
  }

  if (activeMemories.length > 0) {
    addLines(["## Active Memories", ""]);
    for (const m of activeMemories) {
      if (!addLine(
        `- **${m.title}** _(${m.category})_: ${m.content}`,
      )) break;
    }
    addLine("");
  }

  if (features.length > 0) {
    addLines(["## Features", ""]);

    const categories = ["core", "ui", "data", "infra", "integration"];
    for (const cat of categories) {
      const catFeatures = features.filter((f) => f.category === cat);
      if (catFeatures.length === 0) continue;

      addLines([
        `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
        "",
      ]);
      for (const f of catFeatures) {
        if (!addLine(
          `- **${f.name}** (importance: ${f.importance}/10): ${f.description ?? "No description"}`,
        )) break;
        if (f.files.length > 0) {
          addLine(
            `  Files: ${f.files.slice(0, 8).join(", ")}${f.files.length > 8 ? ` (+${f.files.length - 8} more)` : ""}`,
          );
        }
      }
      addLine("");
    }
  }

  // File dependency graph — compact representation
  if (dependencies && dependencies.length > 0) {
    addLines(["## File Dependencies", ""]);

    // Group by source file
    const bySource = new Map<string, Array<{ target: string; type: string; symbols: string[] | null }>>();
    for (const d of dependencies) {
      if (!bySource.has(d.source)) bySource.set(d.source, []);
      bySource.get(d.source)!.push({ target: d.target, type: d.type, symbols: d.symbols });
    }

    for (const [source, targets] of [...bySource.entries()].slice(0, 30)) {
      const imports = targets.map((t) => {
        const sym = t.symbols?.length ? ` {${t.symbols.slice(0, 5).join(", ")}}` : "";
        return `${t.target}${sym}`;
      }).join(", ");
      if (!addLine(`- \`${source}\` → ${imports}`)) break;
    }
    if (bySource.size > 30) {
      addLine(`_(+${bySource.size - 30} more files)_`);
    }
    addLine("");
  }

  // Recent conversations for session continuity
  if (conversations && conversations.length > 0) {
    addLines(["## Recent Activity", ""]);
    for (const c of conversations) {
      const date = c.createdAt.slice(0, 16).replace("T", " ");
      const tagStr = c.tags.length > 0 ? ` [${c.tags.join(", ")}]` : "";
      const truncated = c.content.length > 500
        ? c.content.slice(0, 500) + "..."
        : c.content;
      if (!addLine(`- **${date}**${tagStr}: ${truncated}`)) break;
    }
    addLine("");
  }

  // Active plans with phases
  if (plans && plans.length > 0) {
    addLines(["## Active Plans", ""]);
    for (const plan of plans) {
      addLine(`### ${plan.title}`);
      if (plan.description) addLine(plan.description);
      addLine("");
      if (plan.phases.length > 0) {
        for (const phase of plan.phases) {
          const icon = phase.status === "completed" ? "\u2705" : phase.status === "in_progress" ? "\uD83D\uDD04" : "\u2B1C";
          const desc = phase.description ? ` \u2014 ${phase.description}` : "";
          if (!addLine(`${icon} **${phase.title}**${desc}`)) break;
        }
        addLine("");
      }
    }
  }

  return lines.join("\n");
}
