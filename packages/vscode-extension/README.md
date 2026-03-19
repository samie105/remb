# Remb — VS Code Extension

> Persistent memory and context for AI coding sessions. Makes your AI remember across conversations.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/remb.remb?label=VS%20Code%20Marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=remb.remb)

## Install

Search **"Remb"** in the VS Code Extensions panel, or:

```
ext install remb.remb
```

## Features

### Copilot Chat Participant

Type `@remb` in GitHub Copilot Chat to interact with your project memory:

- `@remb /recall` — Load project context into the conversation
- `@remb /save` — Save a context entry for a feature
- `@remb /memory` — Create or search persistent memories
- `@remb /scan` — Trigger a codebase scan
- `@remb /history` — View recent conversation history

### Language Model Tools

Remb registers 9 tools that GitHub Copilot can invoke autonomously:

| Tool | Description |
|------|-------------|
| `remb_loadProjectContext` | Load full project context bundle |
| `remb_conversationHistory` | Load recent conversation history |
| `remb_conversationLog` | Record session activity |
| `remb_saveContext` | Save feature-specific context |
| `remb_getContext` | Retrieve context entries |
| `remb_listMemories` | Browse persistent memories |
| `remb_createMemory` | Save a new memory |
| `remb_triggerScan` | Trigger codebase scan |
| `remb_scanStatus` | Check scan progress |

### Sidebar Views

The Remb sidebar provides tree views for:

- **Projects** — Switch between registered projects
- **Changes** — See recent codebase changes
- **Memories** — Browse, search, and manage memories
- **MCP Servers** — Connect to MCP servers
- **Context** — View loaded context entries

### Commands

Access via Command Palette (`Cmd+Shift+P`):

- `Remb: Login` / `Remb: Logout`
- `Remb: Save Context` / `Remb: Create Memory`
- `Remb: Search Memories`
- `Remb: Trigger Scan`
- `Remb: Switch Project`
- `Remb: Open Dashboard`
- `Remb: Toggle MCP Server`

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `remb.apiUrl` | `https://www.useremb.com` | API server URL |
| `remb.autoLoadContext` | `true` | Auto-load context on startup |
| `remb.contextRefreshIntervalMinutes` | `2` | Context refresh interval |

## How It Works

1. **Install** the extension and run `Remb: Login`
2. **Initialize** a project with `Remb: Switch Project` or via the CLI (`remb init`)
3. **Use Copilot** normally — Remb's tools auto-inject context into every conversation
4. **Save discoveries** — use `@remb /save` or `@remb /memory` to persist important context

## Links

- [Website](https://www.useremb.com)
- [GitHub](https://github.com/samie105/remb)
- [npm (Node CLI)](https://www.npmjs.com/package/remb-cli)
- [npm (Go CLI)](https://www.npmjs.com/package/remb-go)
