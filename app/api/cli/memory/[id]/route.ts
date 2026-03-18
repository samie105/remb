import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * PATCH /api/cli/memory/[id] — update a memory
 * Body: { title?, content?, tier?, category?, tags? }
 *
 * DELETE /api/cli/memory/[id] — delete a memory
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  let body: {
    title?: string;
    content?: string;
    tier?: string;
    category?: string;
    tags?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = createAdminClient();

  // Verify ownership
  const { data: existing } = await db
    .from("memories")
    .select("id, tier")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};

  if (body.title !== undefined) update.title = body.title;
  if (body.content !== undefined) {
    update.content = body.content;
    update.token_count = Math.ceil(body.content.length / 4);
  }

  const validTiers = ["core", "active", "archive"];
  if (body.tier && validTiers.includes(body.tier)) {
    // Check core tier limit when promoting
    if (body.tier === "core" && existing.tier !== "core") {
      const { count } = await db
        .from("memories")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("tier", "core");

      if ((count ?? 0) >= 20) {
        return NextResponse.json(
          { error: "Core tier limit reached (max 20)" },
          { status: 409 }
        );
      }
    }
    update.tier = body.tier;
  }

  const validCategories = ["preference", "pattern", "decision", "correction", "knowledge", "general"];
  if (body.category && validCategories.includes(body.category)) {
    update.category = body.category;
  }

  if (body.tags !== undefined) update.tags = body.tags;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("memories")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, tier, category, title, token_count, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const db = createAdminClient();

  const { error } = await db
    .from("memories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
