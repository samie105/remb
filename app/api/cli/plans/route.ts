import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/cli/plans?projectSlug=<slug>
 * Returns active plans with their phases for a project.
 * Used by IDEs and CLI to read the current plan.
 *
 * POST /api/cli/plans
 * Body: { projectSlug, planId, phaseId, action: "complete" | "skip" | "start" }
 * Update a phase status from the IDE/CLI.
 */

export async function GET(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const projectSlug = request.nextUrl.searchParams.get("projectSlug");
  if (!projectSlug) {
    return NextResponse.json({ error: "Missing projectSlug" }, { status: 400 });
  }

  const db = createAdminClient();

  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", projectSlug)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get active plans with phases
  const { data: plans } = await db
    .from("plans")
    .select("id, title, description, status, created_at, updated_at")
    .eq("project_id", project.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (!plans?.length) {
    return NextResponse.json({ plans: [] });
  }

  const planIds = plans.map((p) => p.id);
  const { data: allPhases } = await db
    .from("plan_phases")
    .select("id, plan_id, title, description, status, sort_order")
    .in("plan_id", planIds)
    .order("sort_order", { ascending: true });

  const phasesByPlan = new Map<string, typeof allPhases>();
  for (const phase of allPhases ?? []) {
    const list = phasesByPlan.get(phase.plan_id) ?? [];
    list.push(phase);
    phasesByPlan.set(phase.plan_id, list);
  }

  const result = plans.map((p) => ({
    ...p,
    phases: phasesByPlan.get(p.id) ?? [],
  }));

  return NextResponse.json({ plans: result });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const body = (await request.json()) as {
    projectSlug?: string;
    planId?: string;
    phaseId?: string;
    action?: string;
  };

  const { projectSlug, planId, phaseId, action } = body;

  if (!projectSlug || !planId || !phaseId || !action) {
    return NextResponse.json(
      { error: "Missing required fields: projectSlug, planId, phaseId, action" },
      { status: 400 },
    );
  }

  const validActions = ["complete", "skip", "start", "reset"];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
      { status: 400 },
    );
  }

  const statusMap: Record<string, string> = {
    complete: "completed",
    skip: "skipped",
    start: "in_progress",
    reset: "pending",
  };

  const db = createAdminClient();

  // Verify ownership through plan → project
  const { data: plan } = await db
    .from("plans")
    .select("id, project_id, projects!inner(user_id, slug)")
    .eq("id", planId)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const projectData = plan.projects as unknown as { user_id: string; slug: string };
  if (projectData.user_id !== user.id || projectData.slug !== projectSlug) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: phase, error } = await db
    .from("plan_phases")
    .update({ status: statusMap[action] })
    .eq("id", phaseId)
    .eq("plan_id", planId)
    .select("id, title, status")
    .single();

  if (error || !phase) {
    return NextResponse.json({ error: "Phase not found" }, { status: 404 });
  }

  // Check if all phases are completed → auto-complete plan
  const { data: remaining } = await db
    .from("plan_phases")
    .select("id")
    .eq("plan_id", planId)
    .in("status", ["pending", "in_progress"]);

  if (!remaining?.length) {
    await db
      .from("plans")
      .update({ status: "completed" })
      .eq("id", planId);
  }

  return NextResponse.json({ updated: phase });
}
