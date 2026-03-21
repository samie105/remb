<!-- remb-dynamic-context -->
# Remb — Live Project Context

> **Project**: remb | **Refreshed**: 2026-03-21T02:51
> This file is auto-generated and gitignored. It injects real project context into every prompt.
> For the full context bundle, call `remb_loadProjectContext`.

## Current Session Activity

- `02:35:45` viewing `.cursor/mcp.json`
- `02:36:13` saved `packages/cli-go/cmd/serve.go`
- `02:36:23` 🤖 **ai**: ```
```
- `02:36:33` saved `app/landing/_components/mcp.tsx`
- `02:36:33` saved `app/landing/_components/data.ts`
- `02:36:43` 🤖 **ai**: Now update the landing page MCP configs and tool count. The remote config shows `https://mcp.useremb.com/sse` which is wrong — the actual endpoint is `https://www.useremb.com/api/mcp`:
```
```

```
``
- `02:36:56` saved `app/landing/_components/mcp.tsx`
- `02:37:44` 🤖 **ai**: Now let me also update the label on the landing page for the remote config — it says "Cursor / Claude Desktop" but with
this is the standard format for all IDEs that support HTTP MCP:
```
```
Now let'
- `02:38:11` saved `app/landing/_components/mcp.tsx`
- `02:38:11` saved `app/landing/_components/data.ts`
- `02:38:12` saved `packages/cli-go/cmd/serve.go`
- `02:38:43` 🤖 **ai**: Go CLI compiles cleanly. Now let me also check the IDE setup section — the
is dynamically set to `${window.location.origin}/api/mcp` which is correct. But the Cursor snippet uses
which is the right fo
- `02:43:43` 🤖 **ai**: Everything compiles clean. Here's what was done:

**1.
** — Removed the broken HTTP `"Remb"` entry. Only the stdio
(using
) remains.

**2.
rewritten as a transparent MCP proxy** (
) — Instead of 5 har
- `02:44:43` 🤖 **ai**: ):
   -
fixed: `https://mcp.useremb.com/sse` → `https://www.useremb.com/api/mcp` with
-
simplified: removed
(project is auto-detected from
)
   - Tool count: 21 → 33
   - Label: "Cursor / Claude Deskt
- `02:49:51` saved `.cursor/mcp.json`
- `02:50:39` saved `.cursor/mcp.json`
- `02:50:50` viewing `tasks`
- `02:50:50` viewing `.cursor/mcp.json`
- `02:50:50` viewing `mcpServer.cursor-workspace.0.Remb N`
- `02:51:01` viewing `.cursor/mcp.json`

---

_You already have the above context. Use `remb_conversationLog` to record what you accomplish in this session. Use `remb_createMemory` for important discoveries._
