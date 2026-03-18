import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { McpServerRow } from "@/lib/supabase/types";
import {
  aggregateTools,
  aggregateResources,
  aggregatePrompts,
  callTool,
  readResource,
  getPrompt,
} from "@/lib/mcp-proxy";
import { getBuiltinTools, callBuiltinTool, BUILTIN_TOOLS_VERSION } from "@/lib/mcp-memory-tools";

/* ─── MCP protocol constants ─── */

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "remb-hub";
const SERVER_VERSION = "1.0.0";

/** Headers required by the Streamable HTTP spec on every POST response */
const MCP_HEADERS: Record<string, string> = {
  "mcp-version": PROTOCOL_VERSION,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

/** Preflight for CORS */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MCP_HEADERS });
}

/* ─── JSON-RPC helpers ─── */

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function jsonRpcOk(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { headers: MCP_HEADERS }
  );
}

function jsonRpcError(
  id: string | number | undefined | null,
  code: number,
  message: string
) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { headers: MCP_HEADERS }
  );
}

/* ─── fetch user's MCP servers ─── */

async function getUserServers(userId: string): Promise<McpServerRow[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("mcp_servers")
    .select("*")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ─── SSE helper for piggybacking notifications ─── */

function sseResponse(messages: object[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const msg of messages) {
        controller.enqueue(
          encoder.encode(`event: message\ndata: ${JSON.stringify(msg)}\n\n`)
        );
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...MCP_HEADERS,
    },
  });
}

/* ─── POST: main MCP message handler ─── */

export async function POST(request: Request) {
  // Parse JSON body first to check if it's an initialize request
  let raw: unknown;
  try {
    raw = await request.clone().json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  // All methods require authentication — the IDE should obtain an OAuth
  // token before sending any MCP messages (including initialize).
  const authResult = await authenticateCliRequest(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user, apiKeyId } = authResult;

  const messages: JsonRpcRequest[] = Array.isArray(raw) ? raw : [raw as JsonRpcRequest];

  // Check if we need to notify the client that the tool list changed.
  // Skip the check for methods that don't benefit from it (initialize, ping, tools/list).
  const hasToolsList = messages.some((m) => m.method === "tools/list");
  const isHandshake = messages.every((m) => m.method === "initialize" || m.method === "ping");
  let shouldNotifyToolsChanged = false;

  if (!hasToolsList && !isHandshake) {
    const db = createAdminClient();
    const { data: keyInfo } = await db
      .from("api_keys")
      .select("last_tools_version")
      .eq("id", apiKeyId)
      .single();

    if (keyInfo && keyInfo.last_tools_version < Math.max(user.mcp_tools_version, BUILTIN_TOOLS_VERSION)) {
      shouldNotifyToolsChanged = true;
      // Mark as notified so we don't repeat
      await db
        .from("api_keys")
        .update({ last_tools_version: Math.max(user.mcp_tools_version, BUILTIN_TOOLS_VERSION) })
        .eq("id", apiKeyId);
    }
  }

  const sessionId = request.headers.get("mcp-session-id") ?? `mcp-${Date.now()}`;

  const responses = await Promise.all(
    messages.map((body) => handleMessage(body, user.id, apiKeyId, user.mcp_tools_version, sessionId))
  );

  const nonNull = responses.filter(Boolean);

  // If tools changed, respond with SSE to piggyback the notification
  // alongside the normal JSON-RPC response (per MCP Streamable HTTP spec).
  if (shouldNotifyToolsChanged && nonNull.length > 0) {
    const bodies = await Promise.all(nonNull.map((r) => r!.json()));
    return sseResponse([
      { jsonrpc: "2.0", method: "notifications/tools/list_changed" },
      ...bodies,
    ]);
  }

  // Standard responses
  if (nonNull.length === 0) return new NextResponse(null, { status: 202, headers: MCP_HEADERS });
  if (!Array.isArray(raw)) return nonNull[0]!;

  const bodies = await Promise.all(nonNull.map((r) => r!.json()));
  return NextResponse.json(bodies, { headers: MCP_HEADERS });
}

async function handleMessage(
  body: JsonRpcRequest,
  userId: string,
  apiKeyId: string,
  currentToolsVersion: number,
  sessionId: string
): Promise<NextResponse | null> {
  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    return jsonRpcError(body?.id, -32600, "Invalid Request");
  }

  // Notifications (no id) — no response needed
  if (body.id === undefined || body.id === null) {
    return null;
  }

  try {
    switch (body.method) {
      case "initialize":
        return jsonRpcOk(body.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
        });

      case "ping":
        return jsonRpcOk(body.id, {});

      case "tools/list": {
        const servers = await getUserServers(userId);
        const [upstreamTools, builtinTools] = await Promise.all([
          aggregateTools(servers),
          Promise.resolve(getBuiltinTools()),
        ]);
        const allTools = [...builtinTools, ...upstreamTools];

        // Mark this client as up-to-date with the current tools version
        const db = createAdminClient();
        await db
          .from("api_keys")
          .update({ last_tools_version: Math.max(currentToolsVersion, BUILTIN_TOOLS_VERSION) })
          .eq("id", apiKeyId);

        return jsonRpcOk(body.id, {
          tools: allTools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
      }

      case "tools/call": {
        const params = body.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        if (!params?.name) {
          return jsonRpcError(body.id, -32602, "Missing tool name");
        }



        // Auto-capture helper — fire-and-forget after tool execution
        const skipCapture = ["conversation_log", "conversation_history"];
        const autoCapture = (toolName: string, result?: unknown) => {
          if (skipCapture.some((s) => toolName.endsWith(s))) return;
          const argsPreview = JSON.stringify(params.arguments ?? {}).slice(0, 200);
          let resultPreview: string | undefined;
          try {
            const r = result as { content?: { text?: string }[] };
            const text = r?.content?.[0]?.text;
            if (text) resultPreview = text.slice(0, 300);
          } catch { /* ignore */ }
          import("@/lib/conversation-actions").then(({ logConversation }) =>
            logConversation({
              userId,
              sessionId,
              type: "tool_call",
              content: `Called ${toolName}`,
              metadata: { tool: toolName, args_preview: argsPreview, ...(resultPreview && { result_preview: resultPreview }) },
              source: "mcp",
            }).catch(() => {})
          );
        };

        // Route built-in tools (remb__*) to the native handler
        if (params.name.startsWith("remb__")) {
          const toolName = params.name.slice("remb__".length);
          const result = await callBuiltinTool(userId, toolName, params.arguments ?? {});
          autoCapture(params.name, result);
          return jsonRpcOk(body.id, result);
        }

        const servers = await getUserServers(userId);
        const result = await callTool(servers, params.name, params.arguments ?? {});
        autoCapture(params.name, result);
        return jsonRpcOk(body.id, result);
      }

      case "resources/list": {
        const servers = await getUserServers(userId);
        const resources = await aggregateResources(servers);

        // Inject built-in memory resource
        const builtinResources = [
          {
            uri: "remb://memory/core",
            name: "[Remb] Core Memories",
            description: "All core-tier memories — always loaded into AI context. Read this at the start of every session.",
            mimeType: "application/json",
          },
        ];

        return jsonRpcOk(body.id, {
          resources: [
            ...builtinResources,
            ...resources.map((r) => ({
              uri: r.uri,
              name: r.name,
              description: r.description,
              mimeType: r.mimeType,
            })),
          ],
        });
      }

      case "resources/read": {
        const params = body.params as { uri: string };
        if (!params?.uri) {
          return jsonRpcError(body.id, -32602, "Missing resource URI");
        }

        // Handle built-in memory resources
        if (params.uri === "remb://memory/core") {
          const db = createAdminClient();
          const { data, error } = await db
            .from("memories")
            .select("id, tier, category, title, content, tags, token_count")
            .eq("user_id", userId)
            .eq("tier", "core")
            .order("access_count", { ascending: false });

          if (error) {
            return jsonRpcError(body.id, -32603, error.message);
          }

          return jsonRpcOk(body.id, {
            contents: [
              {
                uri: params.uri,
                mimeType: "application/json",
                text: JSON.stringify(data ?? [], null, 2),
              },
            ],
          });
        }

        const servers = await getUserServers(userId);
        const result = await readResource(servers, params.uri);
        return jsonRpcOk(body.id, result);
      }

      case "prompts/list": {
        const servers = await getUserServers(userId);
        const prompts = await aggregatePrompts(servers);
        return jsonRpcOk(body.id, {
          prompts: prompts.map((p) => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments,
          })),
        });
      }

      case "prompts/get": {
        const params = body.params as {
          name: string;
          arguments?: Record<string, string>;
        };
        if (!params?.name) {
          return jsonRpcError(body.id, -32602, "Missing prompt name");
        }
        const servers = await getUserServers(userId);
        const result = await getPrompt(servers, params.name, params.arguments ?? {});
        return jsonRpcOk(body.id, result);
      }

      default:
        return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonRpcError(body.id, -32603, message);
  }
}

/* ─── GET: SSE stream (required by Streamable HTTP spec) ─── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: Request) {
  // Allow SSE connection without auth — auth is enforced on tool/resource calls
  // This prevents MCP clients from failing during the initial handshake

  // Return an SSE stream that sends a keep-alive ping periodically
  // Stateless mode — we don't push server-initiated messages
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Keep-alive every 30s
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(interval);
        }
      }, 30000);

      // Close after 5 minutes (serverless timeout safety)
      setTimeout(() => {
        clearInterval(interval);
        try { controller.close(); } catch {}
      }, 300000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/* ─── DELETE: close session ─── */

export async function DELETE() {
  return new NextResponse(null, { status: 200 });
}
