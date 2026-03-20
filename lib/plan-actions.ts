"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { Json } from "@/lib/supabase/types";

/* ─── types ─── */

export interface Plan {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "active" | "completed" | "archived";
  created_at: string;
  updated_at: string;
}

export interface PlanPhase {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "skipped";
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PlanMessage {
  id: string;
  plan_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PlanWithPhases extends Plan {
  phases: PlanPhase[];
}

/* ─── helpers ─── */

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.dbUser;
}

/* ─── plan CRUD ─── */

export async function getPlans(projectId: string): Promise<Plan[]> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data, error } = await db
    .from("plans")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Plan[];
}

export async function getPlansBySlug(projectSlug: string): Promise<Plan[]> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", projectSlug)
    .single();

  if (!project) throw new Error(`Project "${projectSlug}" not found`);

  return getPlans(project.id);
}

export async function getPlan(planId: string): Promise<PlanWithPhases> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: plan, error } = await db
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", user.id)
    .single();

  if (error || !plan) throw new Error("Plan not found");

  const { data: phases } = await db
    .from("plan_phases")
    .select("*")
    .eq("plan_id", planId)
    .order("sort_order", { ascending: true });

  return {
    ...(plan as unknown as Plan),
    phases: (phases ?? []) as unknown as PlanPhase[],
  };
}

export async function createPlan(input: {
  projectId: string;
  title: string;
  description?: string;
}): Promise<Plan> {
  const user = await requireUser();
  const db = createAdminClient();

  // Verify project ownership
  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("id", input.projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) throw new Error("Project not found");

  const { data, error } = await db
    .from("plans")
    .insert({
      user_id: user.id,
      project_id: input.projectId,
      title: input.title,
      description: input.description ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Plan;
}

export async function updatePlanStatus(
  planId: string,
  status: Plan["status"],
): Promise<Plan> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data, error } = await db
    .from("plans")
    .update({ status })
    .eq("id", planId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Plan;
}

export async function deletePlan(planId: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { error } = await db
    .from("plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/* ─── phase CRUD ─── */

export async function addPhase(input: {
  planId: string;
  title: string;
  description?: string;
  sortOrder?: number;
}): Promise<PlanPhase> {
  const user = await requireUser();
  const db = createAdminClient();

  // Verify plan ownership
  const { data: plan } = await db
    .from("plans")
    .select("id")
    .eq("id", input.planId)
    .eq("user_id", user.id)
    .single();

  if (!plan) throw new Error("Plan not found");

  // Auto-assign sort order if not provided
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const { data: last } = await db
      .from("plan_phases")
      .select("sort_order")
      .eq("plan_id", input.planId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();
    sortOrder = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await db
    .from("plan_phases")
    .insert({
      plan_id: input.planId,
      title: input.title,
      description: input.description ?? null,
      sort_order: sortOrder,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as PlanPhase;
}

export async function updatePhaseStatus(
  phaseId: string,
  status: PlanPhase["status"],
): Promise<PlanPhase> {
  const user = await requireUser();
  const db = createAdminClient();

  // Verify ownership through plan
  const { data: phase } = await db
    .from("plan_phases")
    .select("*, plans!inner(user_id)")
    .eq("id", phaseId)
    .single();

  if (!phase) throw new Error("Phase not found");
  const planData = phase.plans as unknown as { user_id: string };
  if (planData.user_id !== user.id) throw new Error("Not authorized");

  const { data, error } = await db
    .from("plan_phases")
    .update({ status })
    .eq("id", phaseId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as PlanPhase;
}

export async function deletePhase(phaseId: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: phase } = await db
    .from("plan_phases")
    .select("plan_id, plans!inner(user_id)")
    .eq("id", phaseId)
    .single();

  if (!phase) throw new Error("Phase not found");
  const planData = phase.plans as unknown as { user_id: string };
  if (planData.user_id !== user.id) throw new Error("Not authorized");

  const { error } = await db
    .from("plan_phases")
    .delete()
    .eq("id", phaseId);

  if (error) throw new Error(error.message);
}

/* ─── messages ─── */

export async function getPlanMessages(planId: string): Promise<PlanMessage[]> {
  const user = await requireUser();
  const db = createAdminClient();

  // Verify plan ownership
  const { data: plan } = await db
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .single();

  if (!plan) throw new Error("Plan not found");

  const { data, error } = await db
    .from("plan_messages")
    .select("*")
    .eq("plan_id", planId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PlanMessage[];
}

export async function addPlanMessage(input: {
  planId: string;
  role: PlanMessage["role"];
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<PlanMessage> {
  const user = await requireUser();
  const db = createAdminClient();

  // Verify plan ownership
  const { data: plan } = await db
    .from("plans")
    .select("id")
    .eq("id", input.planId)
    .eq("user_id", user.id)
    .single();

  if (!plan) throw new Error("Plan not found");

  const { data, error } = await db
    .from("plan_messages")
    .insert({
      plan_id: input.planId,
      role: input.role,
      content: input.content,
      metadata: (input.metadata ?? {}) as unknown as Json,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as PlanMessage;
}

/* ─── AI chat ─── */

export async function sendPlanMessage(input: {
  planId: string;
  message: string;
  projectSlug: string;
}): Promise<{ reply: string; phases?: Array<{ title: string; description: string }> }> {
  const user = await requireUser();
  const db = createAdminClient();

  // Verify plan ownership + get project context
  const { data: plan } = await db
    .from("plans")
    .select("*, projects!inner(id, name, slug, description, language, repo_name)")
    .eq("id", input.planId)
    .eq("user_id", user.id)
    .single();

  if (!plan) throw new Error("Plan not found");

  // Save the user message
  await addPlanMessage({ planId: input.planId, role: "user", content: input.message });

  // Get conversation history (last 20 messages for context window)
  const { data: history } = await db
    .from("plan_messages")
    .select("role, content")
    .eq("plan_id", input.planId)
    .order("created_at", { ascending: true })
    .limit(20);

  // Get existing phases
  const { data: phases } = await db
    .from("plan_phases")
    .select("title, description, status, sort_order")
    .eq("plan_id", input.planId)
    .order("sort_order", { ascending: true });

  // Get project features for context
  const project = plan.projects as unknown as { id: string; name: string; slug: string; description: string | null; language: string | null; repo_name: string | null };
  const { data: features } = await db
    .from("features")
    .select("name, description")
    .eq("project_id", project.id)
    .limit(30);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are an expert software architect helping plan project architecture and implementation strategy.

Project: ${project.name}
${project.description ? `Description: ${project.description}` : ""}
${project.language ? `Language: ${project.language}` : ""}
${project.repo_name ? `Repository: ${project.repo_name}` : ""}

${features?.length ? `Existing features:\n${features.map((f) => `- ${f.name}: ${f.description ?? "No description"}`).join("\n")}` : ""}

${phases?.length ? `Current plan phases:\n${phases.map((p, i) => `${i + 1}. [${p.status}] ${p.title}: ${p.description ?? ""}`).join("\n")}` : "No phases defined yet."}

Your role:
1. Help the user plan their project architecture and implementation strategy
2. Break down complex features into actionable phases
3. Suggest best practices, patterns, and technologies
4. When the user confirms a plan, output structured phases

When you want to suggest/update phases, include a JSON block at the end of your response in this format:
\`\`\`phases
[{"title": "Phase title", "description": "What to do in this phase"}]
\`\`\`

Only include the phases block when you're proposing new or updated phases. For general discussion, just respond normally.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...(history ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_PLAN_MODEL ?? "gpt-4.1-mini",
    temperature: 0.7,
    max_tokens: 4096,
    messages,
  });

  const reply = response.choices[0]?.message?.content ?? "I couldn't generate a response. Please try again.";

  // Save the assistant message
  await addPlanMessage({ planId: input.planId, role: "assistant", content: reply });

  // Extract phases if present
  const phasesMatch = reply.match(/```phases\n([\s\S]*?)\n```/);
  let extractedPhases: Array<{ title: string; description: string }> | undefined;

  if (phasesMatch) {
    try {
      extractedPhases = JSON.parse(phasesMatch[1]) as Array<{ title: string; description: string }>;

      // Auto-save phases to the plan
      if (extractedPhases?.length) {
        // Clear existing pending phases and replace
        await db
          .from("plan_phases")
          .delete()
          .eq("plan_id", input.planId)
          .eq("status", "pending");

        for (let i = 0; i < extractedPhases.length; i++) {
          await db.from("plan_phases").insert({
            plan_id: input.planId,
            title: extractedPhases[i].title,
            description: extractedPhases[i].description,
            sort_order: i,
          });
        }
      }
    } catch {
      // Failed to parse phases — not critical
    }
  }

  return { reply, phases: extractedPhases };
}

/* ─── plan export for IDE / .remb ─── */

export async function getActivePlanPhases(projectSlug: string): Promise<{
  plans: Array<{
    id: string;
    title: string;
    description: string | null;
    phases: Array<{
      id: string;
      title: string;
      description: string | null;
      status: string;
    }>;
  }>;
}> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", projectSlug)
    .single();

  if (!project) throw new Error(`Project "${projectSlug}" not found`);

  const { data: plans } = await db
    .from("plans")
    .select("id, title, description")
    .eq("project_id", project.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (!plans?.length) return { plans: [] };

  const planIds = plans.map((p) => p.id);
  const { data: allPhases } = await db
    .from("plan_phases")
    .select("id, plan_id, title, description, status, sort_order")
    .in("plan_id", planIds)
    .neq("status", "skipped")
    .order("sort_order", { ascending: true });

  const phasesByPlan = new Map<string, PlanPhase[]>();
  for (const phase of (allPhases ?? []) as unknown as PlanPhase[]) {
    const list = phasesByPlan.get(phase.plan_id) ?? [];
    list.push(phase);
    phasesByPlan.set(phase.plan_id, list);
  }

  return {
    plans: plans.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      phases: (phasesByPlan.get(p.id) ?? []).map((ph) => ({
        id: ph.id,
        title: ph.title,
        description: ph.description,
        status: ph.status,
      })),
    })),
  };
}

/** Generate markdown of active plans for .remb file */
export async function generatePlanMarkdown(projectSlug: string): Promise<string> {
  const { plans } = await getActivePlanPhases(projectSlug);

  if (!plans.length) return "";

  let md = "# Active Plans\n\n";

  for (const plan of plans) {
    md += `## ${plan.title}\n`;
    if (plan.description) md += `${plan.description}\n`;
    md += "\n";

    if (plan.phases.length) {
      md += "### Phases\n";
      for (const phase of plan.phases) {
        const icon = phase.status === "completed" ? "✅" : phase.status === "in_progress" ? "🔄" : "⬜";
        md += `${icon} **${phase.title}**`;
        if (phase.description) md += ` — ${phase.description}`;
        md += "\n";
      }
      md += "\n";
    }
  }

  return md;
}
