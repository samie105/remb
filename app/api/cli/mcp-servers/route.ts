import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/cli/mcp-servers
 *
 * List the user's connected MCP servers with their status and tool counts.
 */
export async function GET(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const db = createAdminClient();

  const { data, error } = await db
    .from("mcp_servers")
    .select("id, name, url, transport, is_active, tools_count, disabled_tools, health_status, last_health_check")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    servers: (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      transport: s.transport,
      isActive: s.is_active,
      toolsCount: s.tools_count,
      disabledTools: s.disabled_tools ?? [],
      healthStatus: s.health_status,
      lastHealthCheck: s.last_health_check,
    })),
  });
}

/**
 * PATCH /api/cli/mcp-servers
 *
 * Toggle an MCP server on/off.
 * Body: { serverId: string }
 */
export async function PATCH(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const db = createAdminClient();

  let body: { serverId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.serverId) {
    return NextResponse.json({ error: "Missing serverId" }, { status: 400 });
  }

  // Fetch current state
  const { data: current } = await db
    .from("mcp_servers")
    .select("id, is_active")
    .eq("id", body.serverId)
    .eq("user_id", user.id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  }

  const { data, error } = await db
    .from("mcp_servers")
    .update({ is_active: !current.is_active })
    .eq("id", body.serverId)
    .eq("user_id", user.id)
    .select("id, name, is_active")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bump tools version for IDE notification
  const { data: userData } = await db
    .from("users")
    .select("mcp_tools_version")
    .eq("id", user.id)
    .single();

  await db
    .from("users")
    .update({ mcp_tools_version: ((userData?.mcp_tools_version as number) ?? 0) + 1 })
    .eq("id", user.id);

  return NextResponse.json({
    id: data.id,
    name: data.name,
    isActive: data.is_active,
    message: `MCP server "${data.name}" ${data.is_active ? "enabled" : "disabled"}`,
  });
}
