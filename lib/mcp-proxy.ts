import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { McpServerRow } from "@/lib/supabase/types";

/* ─── separator used to namespace tools ─── */
const NS_SEP = "__";

/* ─── types ─── */

export interface AggregatedTool {
  name: string; // namespaced: "servername__toolname"
  description?: string;
  inputSchema: Record<string, unknown>;
  /** Which upstream server owns this tool */
  _serverId: string;
  _originalName: string;
}

export interface AggregatedResource {
  uri: string; // namespaced: "servername__uri"
  name?: string;
  description?: string;
  mimeType?: string;
  _serverId: string;
  _originalUri: string;
}

export interface AggregatedPrompt {
  name: string; // namespaced
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
  _serverId: string;
  _originalName: string;
}

/* ─── create a transport for a given server config ─── */

function buildTransport(server: McpServerRow) {
  const url = new URL(server.url);

  const headers: Record<string, string> = {};

  if (server.auth_type === "bearer" && server.auth_token) {
    headers["Authorization"] = `Bearer ${server.auth_token}`;
  } else if (server.auth_type === "oauth" && server.oauth_tokens) {
    const tokens = server.oauth_tokens as unknown as OAuthTokens;
    if (tokens.access_token) {
      headers["Authorization"] = `Bearer ${tokens.access_token}`;
    }
  } else if (server.auth_type === "custom-header" && server.custom_headers) {
    const custom =
      typeof server.custom_headers === "object" && !Array.isArray(server.custom_headers)
        ? (server.custom_headers as Record<string, string>)
        : {};
    Object.assign(headers, custom);
  }

  return new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
  });
}

/* ─── connect to a single upstream MCP, run a callback, then close ─── */

async function withUpstream<T>(
  server: McpServerRow,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({
    name: "remb-hub",
    version: "1.0.0",
  });

  const transport = buildTransport(server);
  await client.connect(transport);

  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/* ─── safe server name for namespace ─── */

function safeNs(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

/* ─── aggregate tools from all active servers ─── */

export async function aggregateTools(
  servers: McpServerRow[]
): Promise<AggregatedTool[]> {
  const active = servers.filter((s) => s.is_active);
  const results = await Promise.allSettled(
    active.map(async (server) => {
      const tools = await withUpstream(server, async (client) => {
        const res = await client.listTools();
        return res.tools;
      });
      return { server, tools };
    })
  );

  const aggregated: AggregatedTool[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { server, tools } = result.value;
    const ns = safeNs(server.name);
    const disabled = new Set(server.disabled_tools ?? []);

    for (const tool of tools) {
      if (disabled.has(tool.name)) continue;
      aggregated.push({
        name: `${ns}${NS_SEP}${tool.name}`,
        description: tool.description
          ? `[${server.name}] ${tool.description}`
          : `[${server.name}]`,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        _serverId: server.id,
        _originalName: tool.name,
      });
    }
  }
  return aggregated;
}

/* ─── list raw tools from a single server ─── */

export interface ServerTool {
  name: string;
  description?: string;
}

export async function listServerTools(
  server: McpServerRow
): Promise<ServerTool[]> {
  return withUpstream(server, async (client) => {
    const res = await client.listTools();
    return res.tools.map((t) => ({ name: t.name, description: t.description }));
  });
}

/* ─── aggregate resources from all active servers ─── */

export async function aggregateResources(
  servers: McpServerRow[]
): Promise<AggregatedResource[]> {
  const active = servers.filter((s) => s.is_active);
  const results = await Promise.allSettled(
    active.map(async (server) => {
      const resources = await withUpstream(server, async (client) => {
        const res = await client.listResources();
        return res.resources;
      });
      return { server, resources };
    })
  );

  const aggregated: AggregatedResource[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { server, resources } = result.value;
    const ns = safeNs(server.name);

    for (const resource of resources) {
      aggregated.push({
        uri: `${ns}${NS_SEP}${resource.uri}`,
        name: resource.name
          ? `[${server.name}] ${resource.name}`
          : `[${server.name}]`,
        description: resource.description,
        mimeType: resource.mimeType,
        _serverId: server.id,
        _originalUri: resource.uri,
      });
    }
  }
  return aggregated;
}

/* ─── aggregate prompts from all active servers ─── */

export async function aggregatePrompts(
  servers: McpServerRow[]
): Promise<AggregatedPrompt[]> {
  const active = servers.filter((s) => s.is_active);
  const results = await Promise.allSettled(
    active.map(async (server) => {
      const prompts = await withUpstream(server, async (client) => {
        const res = await client.listPrompts();
        return res.prompts;
      });
      return { server, prompts };
    })
  );

  const aggregated: AggregatedPrompt[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { server, prompts } = result.value;
    const ns = safeNs(server.name);

    for (const prompt of prompts) {
      aggregated.push({
        name: `${ns}${NS_SEP}${prompt.name}`,
        description: prompt.description
          ? `[${server.name}] ${prompt.description}`
          : `[${server.name}]`,
        arguments: prompt.arguments,
        _serverId: server.id,
        _originalName: prompt.name,
      });
    }
  }
  return aggregated;
}

/* ─── call a namespaced tool ─── */

export async function callTool(
  servers: McpServerRow[],
  namespacedName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const sepIdx = namespacedName.indexOf(NS_SEP);
  if (sepIdx === -1) throw new Error(`Invalid tool name: ${namespacedName}`);

  const ns = namespacedName.slice(0, sepIdx);
  const originalName = namespacedName.slice(sepIdx + NS_SEP.length);

  const server = servers.find((s) => safeNs(s.name) === ns && s.is_active);
  if (!server) throw new Error(`No active MCP server found for namespace: ${ns}`);

  return withUpstream(server, async (client) => {
    const result = await client.callTool({ name: originalName, arguments: args });
    return result;
  });
}

/* ─── read a namespaced resource ─── */

export async function readResource(
  servers: McpServerRow[],
  namespacedUri: string
): Promise<unknown> {
  const sepIdx = namespacedUri.indexOf(NS_SEP);
  if (sepIdx === -1) throw new Error(`Invalid resource URI: ${namespacedUri}`);

  const ns = namespacedUri.slice(0, sepIdx);
  const originalUri = namespacedUri.slice(sepIdx + NS_SEP.length);

  const server = servers.find((s) => safeNs(s.name) === ns && s.is_active);
  if (!server) throw new Error(`No active MCP server found for namespace: ${ns}`);

  return withUpstream(server, async (client) => {
    const result = await client.readResource({ uri: originalUri });
    return result;
  });
}

/* ─── get a namespaced prompt ─── */

export async function getPrompt(
  servers: McpServerRow[],
  namespacedName: string,
  args: Record<string, string>
): Promise<unknown> {
  const sepIdx = namespacedName.indexOf(NS_SEP);
  if (sepIdx === -1) throw new Error(`Invalid prompt name: ${namespacedName}`);

  const ns = namespacedName.slice(0, sepIdx);
  const originalName = namespacedName.slice(sepIdx + NS_SEP.length);

  const server = servers.find((s) => safeNs(s.name) === ns && s.is_active);
  if (!server) throw new Error(`No active MCP server found for namespace: ${ns}`);

  return withUpstream(server, async (client) => {
    const result = await client.getPrompt({ name: originalName, arguments: args });
    return result;
  });
}

/* ─── health check a single server ─── */

export type HealthResult = {
  status: "connected" | "auth_required" | "unreachable" | "error";
  toolsCount: number;
  message?: string;
};

export async function checkHealth(
  server: McpServerRow
): Promise<HealthResult> {
  try {
    const tools = await withUpstream(server, async (client) => {
      const res = await client.listTools();
      return res.tools;
    });
    return { status: "connected", toolsCount: tools.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    if (
      lower.includes("401") ||
      lower.includes("403") ||
      lower.includes("unauthorized") ||
      lower.includes("forbidden") ||
      lower.includes("authentication")
    ) {
      return { status: "auth_required", toolsCount: 0, message: msg };
    }

    if (
      lower.includes("econnrefused") ||
      lower.includes("enotfound") ||
      lower.includes("timeout") ||
      lower.includes("fetch failed") ||
      lower.includes("network")
    ) {
      return { status: "unreachable", toolsCount: 0, message: msg };
    }

    return { status: "error", toolsCount: 0, message: msg };
  }
}
