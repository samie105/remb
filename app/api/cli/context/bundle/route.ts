import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

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

  // Build markdown
  const markdown = buildContextMarkdown(
    { name: project.name, description: project.description, techStack, languages },
    memories ?? [],
    significantFeatures,
    conversations,
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
): string {
  const lines: string[] = [];

  lines.push(`# ${project.name} — Project Context`);
  lines.push("");
  lines.push(
    `> Auto-generated by Remb. Last updated: ${new Date().toISOString().slice(0, 10)}`,
  );
  lines.push("");

  if (project.description) {
    lines.push(project.description);
    lines.push("");
  }

  if (project.techStack.length > 0) {
    lines.push(`**Tech Stack:** ${project.techStack.join(", ")}`);
    lines.push("");
  }

  const langEntries = Object.entries(project.languages).sort(
    (a, b) => b[1] - a[1],
  );
  if (langEntries.length > 0) {
    lines.push(
      `**Languages:** ${langEntries.map(([l, c]) => `${l} (${c})`).join(", ")}`,
    );
    lines.push("");
  }

  const coreMemories = memories.filter((m) => m.tier === "core");
  const activeMemories = memories.filter((m) => m.tier === "active");

  if (coreMemories.length > 0) {
    lines.push("## Core Knowledge (Always Active)");
    lines.push("");
    for (const m of coreMemories) {
      lines.push(`### ${m.title}`);
      lines.push(`_${m.category}_`);
      lines.push("");
      lines.push(m.content);
      lines.push("");
    }
  }

  if (activeMemories.length > 0) {
    lines.push("## Active Memories");
    lines.push("");
    for (const m of activeMemories) {
      lines.push(
        `- **${m.title}** _(${m.category})_: ${m.content}`,
      );
    }
    lines.push("");
  }

  if (features.length > 0) {
    lines.push("## Features");
    lines.push("");

    const categories = ["core", "ui", "data", "infra", "integration"];
    for (const cat of categories) {
      const catFeatures = features.filter((f) => f.category === cat);
      if (catFeatures.length === 0) continue;

      lines.push(
        `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
      );
      lines.push("");
      for (const f of catFeatures) {
        lines.push(
          `- **${f.name}** (importance: ${f.importance}/10): ${f.description ?? "No description"}`,
        );
        if (f.files.length > 0) {
          lines.push(
            `  Files: ${f.files.slice(0, 8).join(", ")}${f.files.length > 8 ? ` (+${f.files.length - 8} more)` : ""}`,
          );
        }
      }
      lines.push("");
    }
  }

  // Recent conversations for session continuity
  if (conversations && conversations.length > 0) {
    lines.push("## Recent Activity");
    lines.push("");
    for (const c of conversations) {
      const date = c.createdAt.slice(0, 16).replace("T", " ");
      const tagStr = c.tags.length > 0 ? ` [${c.tags.join(", ")}]` : "";
      // Truncate long conversation content to keep bundle manageable
      const truncated = c.content.length > 500
        ? c.content.slice(0, 500) + "..."
        : c.content;
      lines.push(`- **${date}**${tagStr}: ${truncated}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
