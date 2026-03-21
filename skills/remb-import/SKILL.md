---
name: remb-import
version: 1.0.0
description: Import AI chat history from 10+ IDEs into Remb for cross-platform conversation continuity. Use when user mentions "import", "migrate", "chat history", or "IDE conversations".
---

# Remb IDE Import

You are helping the user import AI chat history from their IDEs into Remb — consolidating conversations across editors into one persistent memory.

## Quick Start

```bash
# Auto-detect installed IDEs and import all conversations
remb import --all

# Import from a specific IDE
remb import --ide cursor

# Dry run — see what would be imported without sending
remb import --all --dry-run

# List detected IDEs
remb import --list
```

## Supported IDEs

| IDE | Flag | Storage Format |
|-----|------|---------------|
| Cursor | `--ide cursor` | SQLite (VSCDB) |
| VS Code (Copilot) | `--ide vscode` | SQLite (VSCDB) |
| Windsurf | `--ide windsurf` | SQLite (VSCDB) |
| Claude Code | `--ide claude-code` | JSONL files |
| IntelliJ IDEA | `--ide intellij` | XML files |
| PyCharm | `--ide pycharm` | XML files |
| Android Studio | `--ide android-studio` | XML files |
| Visual Studio | `--ide visual-studio` | SQLite + JSON |
| Zed | `--ide zed` | JSON files |
| Sublime Text | `--ide sublime` | JSON files |

## Options

- `--ide <name>` — import from specific IDE
- `--all` — import from all detected IDEs
- `--project <path>` — filter to conversations from a specific project path
- `--remb-project <slug>` — target Remb project (default: from `.remb.yml`)
- `--since <date>` — only import conversations after this date (ISO 8601)
- `--dry-run` — show what would be imported without sending
- `--list` — list detected IDEs and conversation counts
- `--limit <n>` — max conversations to import

## What Gets Imported

Each conversation is processed through Remb's smart ingestion pipeline:
1. **Summarized** by AI (gpt-4.1-nano) — extracts key topics, decisions, code patterns
2. **Embedded** — vector embedding for semantic search
3. **Deduplicated** — cosine similarity check prevents duplicate imports
4. **Thread-assigned** — grouped into conversation threads
5. **Stored** with IDE source tracking for provenance

## IDE Chat Storage Locations

### macOS
- **Cursor**: `~/Library/Application Support/Cursor/User/workspaceStorage/*/state.vscdb`
- **VS Code**: `~/Library/Application Support/Code/User/workspaceStorage/*/state.vscdb`
- **Windsurf**: `~/Library/Application Support/Windsurf/User/workspaceStorage/*/state.vscdb`
- **Claude Code**: `~/.claude/projects/*/`
- **IntelliJ**: `~/Library/Application Support/JetBrains/IntelliJIdea*/`
- **PyCharm**: `~/Library/Application Support/JetBrains/PyCharm*/`
- **Android Studio**: `~/Library/Application Support/Google/AndroidStudio*/`
- **Zed**: `~/.local/share/zed/conversations/`
- **Sublime Text**: `~/Library/Application Support/Sublime Text/Packages/User/LSP-copilot-history/`

### Linux
- **Cursor**: `~/.config/Cursor/User/workspaceStorage/*/state.vscdb`
- **VS Code**: `~/.config/Code/User/workspaceStorage/*/state.vscdb`
- **Claude Code**: `~/.claude/projects/*/`
- **JetBrains IDEs**: `~/.config/JetBrains/<IDE>*/`
- **Zed**: `~/.local/share/zed/conversations/`

### Windows
- **Cursor**: `%APPDATA%/Cursor/User/workspaceStorage/*/state.vscdb`
- **VS Code**: `%APPDATA%/Code/User/workspaceStorage/*/state.vscdb`
- **Visual Studio**: `%LOCALAPPDATA%/Microsoft/VisualStudio/*/copilot/`

## Best Practices

1. **Dry run first** — always check with `--dry-run` before a large import
2. **Filter by date** — use `--since` to avoid importing ancient conversations
3. **Import regularly** — run periodically to keep Remb in sync with your IDE history
4. **Check dedup** — Remb's smart pipeline prevents duplicates, so re-importing is safe
