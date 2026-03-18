# remb

> CLI for Remb — persistent memory layer for AI coding sessions.

## Install

```bash
npm install -g remb
```

## Quick Start

```bash
# 1. Authenticate
remb login --key remb_your_api_key

# 2. Initialize a project
cd my-project
remb init my-project

# 3. Save context
remb save -f auth -c "Implemented PKCE OAuth flow with refresh tokens"

# 4. Retrieve context
remb get -f auth

# 5. Scan a directory
remb scan --path src/auth

# 6. Start MCP server (for AI tool integration)
remb serve
```

## Commands

| Command | Description |
|---------|-------------|
| `remb login` | Authenticate with your API key |
| `remb logout` | Remove stored credentials |
| `remb whoami` | Show authentication status |
| `remb init` | Initialize project tracking |
| `remb save` | Save a context entry |
| `remb get` | Retrieve context entries |
| `remb scan` | Auto-scan a directory |
| `remb link` | Link features together |
| `remb serve` | Start the MCP server |

## Configuration

### Project config (`.remb.yml`)

Created by `remb init` in your project root:

```yaml
project: my-project
api_url: https://useremb.com
```

### Credentials (`~/.config/remb/credentials`)

Stored securely with `chmod 600`:

```
api_key=remb_your_key_here
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `REMB_API_KEY` | Override credential file |

## MCP Server

The `remb serve` command starts a Model Context Protocol server over stdio, exposing `save_context` and `get_context` tools to AI assistants.

Add to your MCP client config (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "remb": {
      "command": "remb",
      "args": ["serve", "--project", "my-project"]
    }
  }
}
```
