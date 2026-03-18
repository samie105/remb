import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { analyzeDiff } from "@/lib/openai";
import type { Json } from "@/lib/supabase/types";

/**
 * POST /api/cli/context/diff
 * Body: { projectSlug: string, diff: string }
 *
 * Analyzes a git diff, extracts feature-level changes,
 * and saves them as context entries.
 */
export async function POST(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  let body: { projectSlug?: string; diff?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectSlug, diff } = body;

  if (!projectSlug || !diff) {
    return NextResponse.json(
      { error: "Missing required fields: projectSlug, diff" },
      { status: 400 },
    );
  }

  if (typeof diff !== "string" || diff.length > 200_000) {
    return NextResponse.json(
      { error: "diff must be a string under 200,000 characters" },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Resolve project
  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", projectSlug)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Analyze diff with AI
  const changes = await analyzeDiff(diff);

  if (changes.length === 0) {
    return NextResponse.json({ analyzed: 0, changes: [] });
  }

  // Save each change as a context entry linked to its feature
  for (const change of changes) {
    // Find or create feature
    let featureId: string;

    const { data: existing } = await db
      .from("features")
      .select("id")
      .eq("project_id", project.id)
      .eq("name", change.feature_name)
      .single();

    if (existing) {
      featureId = existing.id;
    } else {
      const { data: created } = await db
        .from("features")
        .insert({
          project_id: project.id,
          name: change.feature_name,
          description: change.summary,
          status: "active",
        })
        .select("id")
        .single();

      if (!created) continue;
      featureId = created.id;
    }

    // Save context entry
    await db.from("context_entries").insert({
      feature_id: featureId,
      content: change.summary,
      entry_type: "diff",
      source: "cli",
      metadata: {
        category: change.category,
        importance: change.importance,
        files_changed: change.files_changed,
        analyzed_at: new Date().toISOString(),
      } as unknown as Json,
    });
  }

  return NextResponse.json({
    analyzed: changes.length,
    changes,
  });
}
