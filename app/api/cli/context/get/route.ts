import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const params = request.nextUrl.searchParams;

  const projectSlug = params.get("projectSlug");
  const featureName = params.get("featureName");
  const limit = Math.min(Math.max(parseInt(params.get("limit") ?? "10", 10) || 10, 1), 100);

  if (!projectSlug) {
    return NextResponse.json(
      { error: "Missing required query param: projectSlug" },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  // Resolve project by slug + ownership
  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", projectSlug)
    .single();

  if (!project) {
    return NextResponse.json(
      { error: `Project "${projectSlug}" not found` },
      { status: 404 }
    );
  }

  // Build feature filter
  let featureIds: string[] = [];

  if (featureName) {
    const { data: feature } = await db
      .from("features")
      .select("id")
      .eq("project_id", project.id)
      .eq("name", featureName)
      .single();

    if (!feature) {
      return NextResponse.json(
        { error: `Feature "${featureName}" not found` },
        { status: 404 }
      );
    }
    featureIds = [feature.id];
  } else {
    const { data: features } = await db
      .from("features")
      .select("id")
      .eq("project_id", project.id);

    featureIds = (features ?? []).map((f) => f.id);
  }

  if (featureIds.length === 0) {
    return NextResponse.json({ entries: [], total: 0 });
  }

  // Fetch entries
  const { data: entries, error } = await db
    .from("context_entries")
    .select("id, feature_id, content, entry_type, source, metadata, created_at")
    .in("feature_id", featureIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve feature names for the response
  const { data: featureRows } = await db
    .from("features")
    .select("id, name")
    .in("id", featureIds);

  const nameMap = new Map((featureRows ?? []).map((f) => [f.id, f.name]));

  const formatted = (entries ?? []).map((e) => ({
    id: e.id,
    feature: nameMap.get(e.feature_id) ?? e.feature_id,
    content: e.content,
    entry_type: e.entry_type,
    source: e.source,
    metadata: e.metadata,
    created_at: e.created_at,
  }));

  return NextResponse.json({ entries: formatted, total: formatted.length });
}
