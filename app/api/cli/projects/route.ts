import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/cli/projects — list projects for the authenticated user
 * Query params: status, limit
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const db = createAdminClient();

  let query = db
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data: projects, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!projects?.length) {
    return NextResponse.json({ projects: [], total: 0 });
  }

  // Fetch feature + entry counts
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

  const enriched = projects.map((p) => {
    const pFeatureIds = featuresByProject.get(p.id) ?? [];
    const entry_count = pFeatureIds.reduce((acc, fid) => acc + (entriesByFeature.get(fid) ?? 0), 0);
    return { ...p, feature_count: pFeatureIds.length, entry_count };
  });

  return NextResponse.json({ projects: enriched, total: enriched.length });
}

/**
 * POST /api/cli/projects — create a new project
 * Body: { name, description?, repoUrl?, repoName?, language?, branch? }
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const body = await request.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const name = body.name.trim();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    return NextResponse.json(
      { error: "Invalid project name" },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  const { data, error } = await db
    .from("projects")
    .insert({
      user_id: user.id,
      name,
      slug,
      description: body.description ?? null,
      repo_name: body.repoName ?? null,
      repo_url: body.repoUrl ?? null,
      language: body.language ?? null,
      branch: body.branch ?? "main",
      status: "active",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A project with this name already exists", slug },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    project: {
      id: data.id,
      name: data.name,
      slug: data.slug,
      status: data.status,
    },
    created: true,
  });
}
