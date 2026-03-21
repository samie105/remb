---
name: remb-context
version: 1.0.0
description: Save, retrieve, and manage feature-specific context in Remb. Use when user mentions "save context", "get context", "feature context", or "context bundle".
---

# Remb Context Management

You are helping the user manage project context in Remb — saving knowledge about features, retrieving it later, and assembling full project context bundles.

## Save Context

Save a context entry linked to a specific feature:

```bash
remb save -f "auth-system" -c "Uses NextAuth with Google/GitHub OAuth. Session stored in Supabase. Middleware protects /dashboard/* routes."
```

### Options
- `-f, --feature <name>` — feature name (required)
- `-c, --content <text>` — content to save (required)
- `-t, --type <type>` — entry type: `decision`, `pattern`, `note`, `reference`, `dependency` (default: `note`)
- `--tags <tags>` — comma-separated tags
- `-p, --project <slug>` — project (auto-detected from `.remb.yml`)

### From stdin
```bash
git diff HEAD~1 | remb save -f "recent-changes" -t reference
```

## Retrieve Context

```bash
# Get all context for a feature
remb get -f "auth-system"

# Get all context for the project
remb get

# Get as markdown
remb get -f "auth-system" --format markdown

# Limit results
remb get --limit 10
```

## Context Bundle

Get the full project context as a single markdown document (features, context entries, memories, tech stack):

```bash
remb context bundle
```

This returns everything Remb knows about the project — use it when starting a new session or onboarding.

## Diff Analysis

Analyze a git diff and auto-extract context changes:

```bash
git diff main | remb diff
```

This uses AI to identify what changed, creates context entries for affected features, and tracks architectural shifts.

## Batch Save

Save multiple context entries from a file:

```bash
remb save --batch entries.json
```

Where `entries.json` is an array of `{ feature, content, type?, tags? }` objects.

## Best Practices

1. **Name features consistently** — use kebab-case: `auth-system`, `payment-flow`, `user-dashboard`
2. **Save decisions, not just code** — "We chose Zustand over Redux because..." is more valuable than code snippets
3. **Use types** — `decision` for architectural choices, `pattern` for reusable patterns, `reference` for external docs
4. **Tag for cross-cutting concerns** — `--tags "security,auth"` helps with search
