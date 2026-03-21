---
name: remb-memory
version: 1.0.0
description: Create, search, promote, and manage persistent memories across tiers in Remb. Use when user says "remember this", "save a memory", "search memories", or discusses patterns and preferences.
---

# Remb Memory Management

You are helping the user manage persistent memories in Remb — knowledge that persists across all coding sessions.

## Memory Tiers

- **core** — Always loaded into every session. Use for architectural decisions, key patterns, coding preferences. Limited capacity.
- **active** — Loaded on-demand when relevant. Use for feature-specific knowledge, recent discoveries.
- **archive** — Compressed long-term storage. Use for historical context, old decisions.

## Create a Memory

```bash
remb memory create --title "Auth Pattern" --content "All API routes use middleware auth check. Never use inline auth." --category decision --tier core
```

### Options
- `--title <text>` — short title (required)
- `--content <text>` — memory content (required)
- `--tier <tier>` — `core`, `active`, or `archive` (default: `active`)
- `--category <cat>` — `decision`, `pattern`, `preference`, `gotcha`, `reference`
- `--tags <tags>` — comma-separated tags
- `-p, --project <slug>` — project scope (omit for global memories)

## List Memories

```bash
# All memories for current project
remb memory list

# Filter by tier
remb memory list --tier core

# Filter by category
remb memory list --category pattern

# Search
remb memory list --search "auth"
```

## Update a Memory

```bash
remb memory update <id> --content "Updated content here"
```

## Delete a Memory

```bash
remb memory delete <id>
```

## Promote a Memory

Move a memory to a higher tier when it proves important:

```bash
remb memory promote <id> --tier core
```

## When to Create Memories

Create memories when the user:
- Makes an architectural decision: "We're using server actions instead of API routes"
- Discovers a gotcha: "The Supabase client must be created per-request in server components"
- Establishes a pattern: "All forms use react-hook-form + zod validation"
- States a preference: "Always use early returns, never nested if/else"
- Learns something reusable: "pnpm workspace needs explicit dependency declarations"

## Global vs Project Memories

- **Project memories** (with `-p` flag) — scoped to one project, loaded when working in that project
- **Global memories** (no `-p` flag) — loaded in every project, use for personal preferences and universal patterns

## Best Practices

1. **Keep core tier small** — only the most important 10-20 memories
2. **Use categories** — makes filtering and relevance matching better
3. **Promote over time** — start as `active`, promote to `core` if referenced often
4. **Be specific** — "Use Zustand for client state in Next.js" > "Use state management"
