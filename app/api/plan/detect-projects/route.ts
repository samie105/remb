import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json([], { status: 401 });
  }

  const body = (await req.json()) as { query: string };
  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json([]);
  }

  const db = createAdminClient();
  const userId = session.dbUser.id;

  // Get all active projects for the user
  const { data: projects } = await db
    .from("projects")
    .select("id, name, slug")
    .eq("user_id", userId)
    .eq("status", "active");

  if (!projects || projects.length === 0) {
    return NextResponse.json([]);
  }

  // Simple keyword matching: check if the user's message mentions any project name
  const lowerQuery = query.toLowerCase();
  const matches = projects.filter((p) => {
    const name = p.name.toLowerCase();
    const slug = p.slug.toLowerCase();
    return lowerQuery.includes(name) || lowerQuery.includes(slug);
  });

  return NextResponse.json(
    matches.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
  );
}
