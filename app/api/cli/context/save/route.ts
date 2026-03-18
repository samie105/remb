import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export async function POST(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;

  let body: {
    projectSlug?: string;
    featureName?: string;
    content?: string;
    entryType?: string;
    tags?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectSlug, featureName, content, entryType, tags } = body;

  if (!projectSlug || !featureName || !content) {
    return NextResponse.json(
      { error: "Missing required fields: projectSlug, featureName, content" },
      { status: 400 }
    );
  }

  if (typeof content !== "string" || content.length > 50_000) {
    return NextResponse.json(
      { error: "content must be a string under 50,000 characters" },
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

  // Find or create feature
  let featureId: string;
  const { data: existing } = await db
    .from("features")
    .select("id")
    .eq("project_id", project.id)
    .eq("name", featureName)
    .single();

  if (existing) {
    featureId = existing.id;
  } else {
    const { data: created, error: createErr } = await db
      .from("features")
      .insert({ project_id: project.id, name: featureName })
      .select("id")
      .single();

    if (createErr || !created) {
      return NextResponse.json(
        { error: "Failed to create feature" },
        { status: 500 }
      );
    }
    featureId = created.id;
  }

  // Create context entry
  const metadata: Record<string, unknown> = {};
  if (tags?.length) metadata.tags = tags;

  const { data: entry, error: entryErr } = await db
    .from("context_entries")
    .insert({
      feature_id: featureId,
      content,
      entry_type: entryType ?? "manual",
      source: "cli",
      metadata: metadata as Json,
    })
    .select("id, created_at")
    .single();

  if (entryErr || !entry) {
    return NextResponse.json(
      { error: "Failed to create context entry" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { id: entry.id, featureName, created_at: entry.created_at },
    { status: 201 }
  );
}