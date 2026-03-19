# remb CLI (Go)

A fast, zero-dependency CLI for Remb — persistent memory layer for AI coding sessions.

## Installation

### One-liner (macOS / Linux)

```bash
curl -fsSL https://www.useremb.com/install.sh | sh
```

### From source

```bash
cd packages/cli-go
make install
```

### Go install

```bash
go install github.com/samie105/remb@latest
```

### Manual download

Download pre-built binaries from [GitHub Releases](https://github.com/samie105/remb/releases):

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `remb-darwin-arm64` |
| macOS (Intel) | `remb-darwin-amd64` |
| Linux (x86_64) | `remb-linux-amd64` |
| Linux (ARM64) | `remb-linux-arm64` |
| Windows | `remb-windows-amd64.exe` |

## Quick Start

```bash
# Authenticate
remb login

# Initialize a project
cd your-project
remb init

# Save context
remb save -f "auth-system" -c "Uses JWT tokens with refresh rotation"

# Retrieve context
remb get -f "auth-system"

# Auto-scan a directory
remb scan --path ./src

# Link features
remb link --from auth --to database --type depends_on

# Start MCP server (for AI tool integration)
remb serve
```

## Commands

| Command | Description |
|---------|-------------|
| `login` | Authenticate via browser OAuth or `--key` |
| `logout` | Remove stored credentials |
| `whoami` | Show auth status |
| `init` | Initialize `.remb.yml` in current directory |
| `save` | Save a context entry (`-f feature -c content`) |
| `get` | Retrieve entries (`-f feature --format json\|table\|markdown`) |
| `scan` | Auto-scan directory for context |
| `link` | Create feature relationships |
| `serve` | Start MCP server (stdio transport) |

## Configuration

**Project config** (`.remb.yml` — safe to commit):
```yaml
project: my-project
api_url: https://www.useremb.com
```

**Credentials** (`~/.config/remb/credentials` — keep secret):
```
api_key=remb_xxxx...
```

Environment variable `REMB_API_KEY` overrides the credentials file.

## Building

```bash
make build          # Build for current platform
make release        # Cross-compile all platforms
make test           # Run tests
make install        # Install to /usr/local/bin
make clean          # Clean build artifacts
```

## Why Go?

- **Single binary** — no Node.js, no npm, no runtime dependencies
- **Fast startup** — ~5ms cold start vs ~200ms for Node.js
- **Cross-platform** — compiles to native binaries for macOS, Linux, Windows (x86_64 + ARM64)
- **Easy distribution** — `curl | sh` install, Homebrew tap, or just download and run
