---
name: remb-setup
version: 1.0.0
description: First-time Remb setup — login, init, MCP configuration, and IDE extension install. Use when user says "set up remb", "configure remb", or "install remb".
---

# Remb Setup

You are helping the user set up Remb — a persistent memory layer for AI coding sessions.

## Step 1: Install the CLI

```bash
# macOS/Linux
brew install samie105/tap/remb

# Or via npm
npm install -g @AIsavant/remb
```

## Step 2: Authenticate

```bash
remb login
```

This opens a browser for OAuth. After login, credentials are stored at `~/.config/remb/credentials.json`.

## Step 3: Initialize the Project

```bash
remb init
```

This will:
1. Ask for or create a project on Remb
2. Create `.remb.yml` in the project root with the project slug and API URL
3. Inject IDE-specific instruction files (`.github/copilot-instructions.md`, `.cursor/rules/remb.mdc`, `CLAUDE.md`, etc.)
4. Add dynamic context files to `.gitignore`

### Flags
- `--project <slug>` — use existing project
- `--ide <name>` — target specific IDE: `vscode`, `cursor`, `windsurf`, `claude`, `jetbrains`, `cline`, `aider`, `all`
- `--no-instructions` — skip instruction file injection

## Step 4: Configure MCP Server (Optional)

For richer integration, add Remb as an MCP server in your IDE:

```bash
remb serve
```

Or add to your IDE's MCP config:
```json
{
  "remb": {
    "command": "remb",
    "args": ["serve"]
  }
}
```

## Step 5: Install VS Code Extension (Optional)

Install "Remb" from the VS Code marketplace. It auto-syncs dynamic context (project bundle, memories, conversation history) every 2 minutes.

## Verification

After setup, confirm everything works:
```bash
remb whoami        # Check auth
remb projects      # List your projects
remb get -f test   # Try fetching context
```
