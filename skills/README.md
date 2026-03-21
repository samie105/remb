# Remb Skills

Modular AI agent knowledge packages for [Remb](https://www.useremb.com) — persistent memory layer for AI coding sessions.

## What are Skills?

Skills teach your AI coding assistant (GitHub Copilot, Claude, Cursor, Windsurf) how to use Remb effectively. Each skill encodes a specific workflow — scanning your codebase, managing memories, importing chat history, etc.

## Installation

```bash
# Install via Remb CLI (recommended)
remb skills add remb-context

# Install all recommended skills
remb skills add --all

# List available skills
remb skills list
```

Or use the skills CLI directly:
```bash
npx skills@latest add samie105/skills/remb-context
```

## Available Skills

| Skill | Description |
|-------|-------------|
| [remb-setup](./remb-setup/) | First-time setup: `remb login`, `remb init`, MCP configuration, extension install |
| [remb-context](./remb-context/) | Save, retrieve, and manage feature-specific context and bundles |
| [remb-memory](./remb-memory/) | Create, search, promote, and manage persistent memories across tiers |
| [remb-scan](./remb-scan/) | Scan codebases, set up webhooks, and interpret scan results |
| [remb-import](./remb-import/) | Import AI chat history from 10+ IDEs into Remb |
| [remb-cross-project](./remb-cross-project/) | Search across projects, transfer patterns, and load external context bundles |

## Skill Format

Each skill is a directory containing a `SKILL.md` with YAML frontmatter:

```yaml
---
name: remb-example
version: 1.0.0
description: What this skill teaches the AI agent.
---

Instructions for the AI agent...
```

## Creating Custom Skills

See [mattpocock/skills](https://github.com/mattpocock/skills) for the skill format specification. Any skill following the SKILL.md format can be installed via `remb skills add <github-user>/<repo>/<skill>`.
