# remb-go

> Go binary installer for [Remb](https://useremb.com) — persistent memory layer for AI coding sessions.

This package downloads and installs the pre-built Go binary for your platform via npm. The binary itself has **zero runtime dependencies** — Node.js is only used for the installation step.

## Install

```bash
npm install -g remb-go
```

This runs a postinstall script that downloads the correct binary for your OS and architecture from [GitHub Releases](https://github.com/useremb/remb/releases).

### Alternative installation methods

| Method | Command |
|--------|---------|
| **curl** (recommended) | `curl -fsSL https://useremb.com/install.sh \| sh` |
| **Homebrew** | `brew tap useremb/remb && brew install remb` |
| **Go install** | `go install github.com/useremb/remb@latest` |

## Supported Platforms

| Platform | Architecture |
|----------|-------------|
| macOS | Apple Silicon (arm64) |
| macOS | Intel (amd64) |
| Linux | x86_64 (amd64) |
| Linux | ARM64 |
| Windows | x86_64 (amd64) |

## Usage

After installation, the `remb` command is available globally:

```bash
remb login          # Authenticate via browser OAuth
remb init           # Initialize project in current directory
remb scan           # Scan codebase and extract features
remb context        # Load project context
remb save           # Save a context entry
remb get            # Retrieve context entries
remb memory         # Manage persistent memories
remb serve          # Start MCP server (stdio)
```

## Why remb-go over remb-cli?

| | remb-go | remb-cli |
|---|---------|----------|
| Runtime | Native Go binary | Node.js |
| Startup time | ~5ms | ~200ms |
| Dependencies | None | Node.js 18+ |
| Size | ~8 MB binary | ~111 KB + Node |

Both CLIs have the same feature set. Use `remb-go` when you want maximum performance and zero dependencies.

## Links

- [Website](https://useremb.com)
- [GitHub](https://github.com/useremb/remb)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=remb.remb)
- [Node CLI (remb-cli)](https://www.npmjs.com/package/remb-cli)
