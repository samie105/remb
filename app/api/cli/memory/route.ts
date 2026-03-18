import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai";

/**
 * GET /api/cli/memory — list memories
 * Query params: tier, category, project, search, limit
 *
 * POST /api/cli/memory — create a memory
 * Body: { title, content, tier?, category?, tags?, projectSlug? }
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const { searchParams } = request.nextUrl;
  const tier = searchParams.get("tier");
  const category = searchParams.get("category");
  const projectSlug = searchParams.get("project");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const db = createAdminClient();

  // If searching semantically, use the RPC function
  if (search) {
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(search);
    } catch {
      // Fall back to title/content text search below
    }

    if (embedding) {
      const args: {
        p_user_id: string;
        query_embedding: string;
        match_count: number;
        p_tier?: string;
        p_project_id?: string;
      } = {
        p_user_id: user.id,
        query_embedding: JSON.stringify(embedding),
        match_count: limit,
      };
      if (tier) args.p_tier = tier;

      const { data, error } = await db.rpc("search_memories", args);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ memories: data ?? [], total: data?.length ?? 0 });
    }
  }

  // Standard filtered query
  let query = db
    .from("memories")
    .select("id, tier, category, title, content, compressed_content, tags, token_count, access_count, last_accessed_at, created_at, updated_at, project_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (tier) query = query.eq("tier", tier as "core" | "active" | "archive");
  if (category) query = query.eq("category", category as "preference" | "pattern" | "decision" | "correction" | "knowledge" | "general");

  if (projectSlug) {
    const { data: project } = await db
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("slug", projectSlug)
      .single();

    if (project) {
      // Return both project-scoped memories AND global memories (project_id IS NULL)
      query = query.or(`project_id.eq.${project.id},project_id.is.null`);
    }
  }

  // Text search fallback on title/content
  if (search) {
    // Escape PostgREST special characters to prevent filter injection
    const safe = search
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_")
      .replace(/\./g, "\\.")
      .replace(/,/g, "\\,");
    query = query.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ memories: data ?? [], total: data?.length ?? 0 });
}

export async function POST(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  let body: {
    title?: string;
    content?: string;
    tier?: string;
    category?: string;
    tags?: string[];
    projectSlug?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, content, tier, category, tags, projectSlug } = body;

  if (!title || !content) {
    return NextResponse.json(
      { error: "Missing required fields: title, content" },
      { status: 400 }
    );
  }

  if (typeof content !== "string" || content.length > 50_000) {
    return NextResponse.json(
      { error: "content must be a string under 50,000 characters" },
      { status: 400 }
    );
  }

  const validTiers = ["core", "active", "archive"];
  const memoryTier = validTiers.includes(tier ?? "") ? tier : "active";

  const validCategories = ["preference", "pattern", "decision", "correction", "knowledge", "general"];
  const memoryCategory = validCategories.includes(category ?? "") ? category : "general";

  // Check core tier limit
  if (memoryTier === "core") {
    const db = createAdminClient();
    const { count } = await db
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("tier", "core");

    if ((count ?? 0) >= 20) {
      return NextResponse.json(
        { error: "Core tier limit reached (max 20). Promote fewer memories to core, or demote existing ones." },
        { status: 409 }
      );
    }
  }

  const db = createAdminClient();

  // Resolve project
  let projectId: string | null = null;
  if (projectSlug) {
    const { data: project } = await db
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("slug", projectSlug)
      .single();

    if (project) projectId = project.id;
  }

  // Estimate tokens
  const tokenCount = Math.ceil(content.length / 4);

  // Generate embedding
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(`${title}\n${content}`);
  } catch {
    // Non-fatal
  }

  const { data, error } = await db
    .from("memories")
    .insert({
      user_id: user.id,
      project_id: projectId,
      tier: memoryTier as "core" | "active" | "archive",
      category: memoryCategory as "preference" | "pattern" | "decision" | "correction" | "knowledge" | "general",
      title,
      content,
      tags: tags ?? [],
      token_count: tokenCount,
      embedding: embedding ? JSON.stringify(embedding) : null,
    })
    .select("id, tier, category, title, token_count, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
