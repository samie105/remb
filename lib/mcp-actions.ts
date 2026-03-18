"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { checkHealth, listServerTools as proxyListTools, type HealthResult, type ServerTool } from "@/lib/mcp-proxy";
import type { UserRow, McpServerRow } from "@/lib/supabase/types";

/* ─── helpers ─── */

async function requireUser(): Promise<UserRow> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.dbUser;
}

/** Increment the user's mcp_tools_version so connected IDEs get a listChanged notification. */
async function bumpToolsVersion(userId: string): Promise<void> {
  const db = createAdminClient();
  // Fetch current version, increment, update — atomic enough for this use case
  const { data } = await db
    .from("users")
    .select("mcp_tools_version")
    .eq("id", userId)
    .single();
  await db
    .from("users")
    .update({ mcp_tools_version: (data?.mcp_tools_version ?? 0) + 1 })
    .eq("id", userId);
}

/* ─── types ─── */

export interface McpServerInfo {
  id: string;
  name: string;
  url: string;
  transport: McpServerRow["transport"];
  auth_type: McpServerRow["auth_type"];
  is_active: boolean;
  tools_count: number;
  disabled_tools: string[];
  health_status: McpServerRow["health_status"];
  last_health_check: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddMcpServerInput {
  name: string;
  url: string;
  transport?: McpServerRow["transport"];
  auth_type?: McpServerRow["auth_type"];
  auth_token?: string;
  custom_headers?: Record<string, string>;
}

export interface UpdateMcpServerInput {
  name?: string;
  url?: string;
  transport?: McpServerRow["transport"];
  auth_type?: McpServerRow["auth_type"];
  auth_token?: string | null;
  custom_headers?: Record<string, string>;
}

/* ─── row → public shape ─── */

function toInfo(row: McpServerRow): McpServerInfo {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport: row.transport,
    auth_type: row.auth_type,
    is_active: row.is_active,
    tools_count: row.tools_count,
    disabled_tools: row.disabled_tools ?? [],
    health_status: row.health_status,
    last_health_check: row.last_health_check,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/* ─── public actions ─── */

export async function listMcpServers(): Promise<McpServerInfo[]> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data, error } = await db
    .from("mcp_servers")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(toInfo);
}

export async function addMcpServer(input: AddMcpServerInput): Promise<McpServerInfo> {
  const user = await requireUser();
  const db = createAdminClient();

  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  let url: URL;
  try {
    url = new URL(input.url.trim());
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("URL must use http or https protocol");
  }

  const { data, error } = await db
    .from("mcp_servers")
    .insert({
      user_id: user.id,
      name,
      url: url.toString(),
      transport: input.transport ?? "streamable-http",
      auth_type: input.auth_type ?? "none",
      auth_token: input.auth_token ?? null,
      custom_headers: input.custom_headers ?? {},
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("An MCP server with that name already exists");
    throw new Error(error.message);
  }
  await bumpToolsVersion(user.id);
  return toInfo(data);
}

export async function updateMcpServer(
  serverId: string,
  input: UpdateMcpServerInput
): Promise<McpServerInfo> {
  const user = await requireUser();
  const db = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Name cannot be empty");
    updates.name = name;
  }
  if (input.url !== undefined) {
    let url: URL;
    try {
      url = new URL(input.url.trim());
    } catch {
      throw new Error("Invalid URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("URL must use http or https protocol");
    }
    updates.url = url.toString();
  }
  if (input.transport !== undefined) updates.transport = input.transport;
  if (input.auth_type !== undefined) updates.auth_type = input.auth_type;
  if (input.auth_token !== undefined) updates.auth_token = input.auth_token;
  if (input.custom_headers !== undefined) updates.custom_headers = input.custom_headers;

  const { data, error } = await db
    .from("mcp_servers")
    .update(updates)
    .eq("id", serverId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return toInfo(data);
}

export async function toggleMcpServer(serverId: string): Promise<McpServerInfo> {
  const user = await requireUser();
  const db = createAdminClient();

  // fetch current state
  const { data: current, error: fetchError } = await db
    .from("mcp_servers")
    .select("is_active")
    .eq("id", serverId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !current) throw new Error("MCP server not found");

  const { data, error } = await db
    .from("mcp_servers")
    .update({ is_active: !current.is_active })
    .eq("id", serverId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await bumpToolsVersion(user.id);
  return toInfo(data);
}

export async function removeMcpServer(serverId: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { error } = await db
    .from("mcp_servers")
    .delete()
    .eq("id", serverId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  await bumpToolsVersion(user.id);
}

export async function testMcpServer(
  serverId: string
): Promise<McpServerInfo & { lastTestResult: HealthResult }> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: server, error: fetchError } = await db
    .from("mcp_servers")
    .select("*")
    .eq("id", serverId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !server) throw new Error("MCP server not found");

  const result = await checkHealth(server);

  const healthStatus =
    result.status === "connected"
      ? "healthy"
      : result.status === "auth_required"
        ? "unhealthy"
        : "unhealthy";

  const { data: updated, error: updateError } = await db
    .from("mcp_servers")
    .update({
      health_status: healthStatus,
      tools_count: result.toolsCount,
      last_health_check: new Date().toISOString(),
    })
    .eq("id", serverId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateError) throw new Error(updateError.message);

  return { ...toInfo(updated), lastTestResult: result };
}

/* ─── list available tools from a single MCP server ─── */

export async function fetchServerTools(
  serverId: string
): Promise<{ tools: ServerTool[]; disabledTools: string[] }> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: server, error } = await db
    .from("mcp_servers")
    .select("*")
    .eq("id", serverId)
    .eq("user_id", user.id)
    .single();

  if (error || !server) throw new Error("MCP server not found");

  const tools = await proxyListTools(server);
  return { tools, disabledTools: server.disabled_tools ?? [] };
}

/* ─── update disabled tools for a server ─── */

export async function updateDisabledTools(
  serverId: string,
  disabledTools: string[]
): Promise<McpServerInfo> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data, error } = await db
    .from("mcp_servers")
    .update({ disabled_tools: disabledTools })
    .eq("id", serverId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await bumpToolsVersion(user.id);
  return toInfo(data);
}
