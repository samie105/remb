import { NextRequest } from "next/server";
import OpenAI from "openai";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { addPlanMessage } from "@/lib/plan-actions";

/* ─── context loader ─── */

async function loadProjectContext(projectId: string, userId: string) {
  const db = createAdminClient();

  // Latest scan for tech stack + languages
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

  // Memories: core + active, project-scoped + global
  const { data: memories } = await db
    .from("memories")
    .select("tier, category, title, content")
    .eq("user_id", userId)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .in("tier", ["core", "active"])
    .order("tier")
    .order("access_count", { ascending: false })
    .limit(40);

  // Features + context entries for file mapping
  const { data: features } = await db
    .from("features")
    .select("id, name, description, status")
    .eq("project_id", projectId)
    .eq("status", "active");

  const featureIds = (features ?? []).map((f) => f.id);
  const { data: entries } = featureIds.length > 0
    ? await db
        .from("context_entries")
        .select("feature_id, metadata")
        .in("feature_id", featureIds)
    : { data: [] as { feature_id: string; metadata: unknown }[] };

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
      if (typeof meta?.importance === "number") importanceValues.push(meta.importance);
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
        ? Math.round(importanceValues.reduce((s, v) => s + v, 0) / importanceValues.length)
        : 5,
      description: f.description,
      files: [...new Set(files)].slice(0, 8),
    };
  }).sort((a, b) => b.importance - a.importance).filter((f) => f.importance >= 3);

  // File dependency graph (compact)
  const { data: deps } = await db
    .from("file_dependencies")
    .select("source_path, target_path, import_type, imported_symbols")
    .eq("project_id", projectId)
    .limit(200);

  return { techStack, languages, memories: memories ?? [], features: featureSummaries, deps: deps ?? [] };
}

function buildContextBlock(
  project: { name: string; description: string | null; language: string | null; repo_name: string | null },
  ctx: Awaited<ReturnType<typeof loadProjectContext>>,
): string {
  const lines: string[] = [];

  if (ctx.techStack.length > 0) lines.push(`Tech Stack: ${ctx.techStack.join(", ")}`);
  const topLangs = Object.entries(ctx.languages).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (topLangs.length > 0) lines.push(`Languages: ${topLangs.map(([l, c]) => `${l} (${c})`).join(", ")}`);

  // Core memories
  const coreMemories = ctx.memories.filter((m) => m.tier === "core");
  if (coreMemories.length > 0) {
    lines.push("", "## Core Knowledge");
    for (const m of coreMemories) {
      lines.push(`### ${m.title} (${m.category})`, m.content, "");
    }
  }

  // Active memories
  const activeMemories = ctx.memories.filter((m) => m.tier === "active");
  if (activeMemories.length > 0) {
    lines.push("", "## Active Memories");
    for (const m of activeMemories) {
      lines.push(`- **${m.title}** (${m.category}): ${m.content.slice(0, 300)}`);
    }
  }

  // Features grouped by category
  if (ctx.features.length > 0) {
    lines.push("", "## Features");
    const categories = ["core", "ui", "data", "infra", "integration"];
    for (const cat of categories) {
      const catFeatures = ctx.features.filter((f) => f.category === cat);
      if (catFeatures.length === 0) continue;
      lines.push(`### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
      for (const f of catFeatures) {
        lines.push(`- **${f.name}** (importance: ${f.importance}/10): ${f.description ?? "No description"}`);
        if (f.files.length > 0) lines.push(`  Files: ${f.files.join(", ")}`);
      }
    }
  }

  // Compact dependency graph
  if (ctx.deps.length > 0) {
    const bySource = new Map<string, string[]>();
    for (const d of ctx.deps) {
      if (!bySource.has(d.source_path)) bySource.set(d.source_path, []);
      bySource.get(d.source_path)!.push(d.target_path);
    }
    lines.push("", "## Key File Dependencies");
    for (const [source, targets] of [...bySource.entries()].slice(0, 20)) {
      lines.push(`- ${source} → ${targets.join(", ")}`);
    }
  }

  return lines.join("\n");
}

/* ─── OpenAI tool definitions ─── */

const PLAN_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_phase",
      description:
        "Create a new phase (milestone) in the current plan. Use this when the user agrees on a plan structure or when you've determined the right phases.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title of the phase" },
          description: { type: "string", description: "Detailed description of what this phase involves" },
        },
        required: ["title", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_phase",
      description: "Update the status of an existing phase.",
      parameters: {
        type: "object",
        properties: {
          phase_id: { type: "string", description: "The UUID of the phase" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed", "skipped"],
            description: "The new status",
          },
        },
        required: ["phase_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_phase",
      description: "Delete a phase from the plan.",
      parameters: {
        type: "object",
        properties: { phase_id: { type: "string", description: "The UUID of the phase" } },
        required: ["phase_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_context",
      description: "Fetch project features, tech stack, and existing context to inform planning decisions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_plan",
      description: "Mark the entire plan as completed. Only call when all phases are done or the user says so.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_phases",
      description: "List all current phases of this plan with their statuses.",
      parameters: { type: "object", properties: {} },
    },
  },
];

/* ─── Tool execution ─── */

async function executePlanTool(
  toolName: string,
  args: Record<string, unknown>,
  context: { planId: string; projectId: string; userId: string },
): Promise<string> {
  const db = createAdminClient();

  switch (toolName) {
    case "create_phase": {
      const { data: last } = await db
        .from("plan_phases")
        .select("sort_order")
        .eq("plan_id", context.planId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();
      const sortOrder = (last?.sort_order ?? -1) + 1;
      const { data, error } = await db
        .from("plan_phases")
        .insert({ plan_id: context.planId, title: args.title as string, description: (args.description as string) ?? null, sort_order: sortOrder })
        .select("*")
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, phase: data });
    }
    case "update_phase": {
      const { data, error } = await db
        .from("plan_phases")
        .update({ status: args.status as string })
        .eq("id", args.phase_id as string)
        .eq("plan_id", context.planId)
        .select("*")
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, phase: data });
    }
    case "delete_phase": {
      const { error } = await db
        .from("plan_phases")
        .delete()
        .eq("id", args.phase_id as string)
        .eq("plan_id", context.planId);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true });
    }
    case "get_project_context": {
      const ctx = await loadProjectContext(context.projectId, context.userId);
      const { data: proj } = await db
        .from("projects")
        .select("name, slug, description, language, repo_name")
        .eq("id", context.projectId)
        .single();
      return JSON.stringify({
        project: proj,
        techStack: ctx.techStack,
        languages: ctx.languages,
        memories: ctx.memories.map((m) => ({ title: m.title, category: m.category, content: m.content.slice(0, 500) })),
        features: ctx.features,
      });
    }
    case "complete_plan": {
      const { data, error } = await db
        .from("plans")
        .update({ status: "completed" })
        .eq("id", context.planId)
        .eq("user_id", context.userId)
        .select("*")
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, plan: data });
    }
    case "list_phases": {
      const { data: phases } = await db
        .from("plan_phases")
        .select("id, title, description, status, sort_order")
        .eq("plan_id", context.planId)
        .order("sort_order", { ascending: true });
      return JSON.stringify({ phases: phases ?? [] });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
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
    planId: string;
    message: string;
    projectSlug: string;
  };

  const { planId, message, projectSlug } = body;
  if (!planId || !message || !projectSlug) {
    return new Response("Missing required fields", { status: 400 });
  }

  const db = createAdminClient();
  const userId = session.dbUser.id;

  // Verify plan ownership + get project info
  const { data: plan, error: planError } = await db
    .from("plans")
    .select("*, projects!inner(id, name, slug, description, language, repo_name)")
    .eq("id", planId)
    .eq("user_id", userId)
    .single();

  if (planError || !plan) {
    return new Response("Plan not found", { status: 404 });
  }

  const project = plan.projects as unknown as {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    language: string | null;
    repo_name: string | null;
  };

  // Save user message
  await addPlanMessage({ planId, role: "user", content: message });

  // Load conversation history (last 30)
  const { data: history } = await db
    .from("plan_messages")
    .select("role, content")
    .eq("plan_id", planId)
    .order("created_at", { ascending: true })
    .limit(30);

  // Load existing phases
  const { data: phases } = await db
    .from("plan_phases")
    .select("id, title, description, status, sort_order")
    .eq("plan_id", planId)
    .order("sort_order", { ascending: true });

  // Load full project context (memories, features, tech stack, deps)
  const projectContext = await loadProjectContext(project.id, userId);
  const contextBlock = buildContextBlock(project, projectContext);

  const systemPrompt = `You are an expert software architect helping plan project architecture and implementation strategy. You have deep knowledge of this project from its scanned codebase.

# Project: ${project.name}
${project.description ? `Description: ${project.description}` : ""}
${project.language ? `Primary Language: ${project.language}` : ""}
${project.repo_name ? `Repository: ${project.repo_name}` : ""}

${contextBlock}

${phases?.length ? `## Current Plan Phases\n${phases.map((p, i) => `${i + 1}. [${p.status}] ${p.title} (id: ${p.id}): ${p.description ?? ""}`).join("\n")}` : "No phases defined yet."}

Plan title: ${plan.title}
${plan.description ? `Plan description: ${plan.description}` : ""}

You have tools to manage plan phases. Use them to:
- Create phases when the user agrees on a structure
- Update phase status as work progresses
- Delete phases that are no longer relevant
- Fetch project context when you need more or refreshed info
- List phases to check current state
- Complete the plan when all work is done

Be conversational but action-oriented. Reference specific features, files, and architectural patterns from the project context when making recommendations. When the user describes what they want to build, break it down into concrete phases using the create_phase tool. Always explain what you're doing before calling tools.`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...(history ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const toolContext = { planId, projectId: project.id, userId };

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
        const currentMessages = [...messages];
        let fullReply = "";
        let loopCount = 0;
        const maxLoops = 10; // prevent infinite tool loops

        while (loopCount < maxLoops) {
          loopCount++;

          const response = await openai.chat.completions.create({
            model: process.env.OPENAI_PLAN_MODEL ?? "gpt-4.1-mini",
            temperature: 0.7,
            max_tokens: 4096,
            messages: currentMessages,
            tools: PLAN_TOOLS,
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

            // Stream text content
            if (delta?.content) {
              accumulatedContent += delta.content;
              send("text", { content: delta.content });
            }

            // Accumulate tool calls
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

          fullReply += accumulatedContent;

          // If no tool calls, we're done
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
              // malformed args
            }

            send("tool_call", { name: tc.name, args });

            const result = await executePlanTool(tc.name, args, toolContext);

            send("tool_result", { name: tc.name, result: JSON.parse(result) });

            currentMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            });
          }
        }

        // Save the full assistant reply
        if (fullReply.trim()) {
          await addPlanMessage({
            planId,
            role: "assistant",
            content: fullReply,
            metadata: {} as unknown as Record<string, unknown>,
          });
        }

        // Send updated phases
        const { data: updatedPhases } = await db
          .from("plan_phases")
          .select("*")
          .eq("plan_id", planId)
          .order("sort_order", { ascending: true });

        send("phases", { phases: updatedPhases ?? [] });
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
