---
name: remb-cross-project
version: 1.0.0
description: Search across multiple Remb projects, transfer patterns, and load external context bundles. Use when user says "like in project X", "cross-project", "other repo", or wants to reuse patterns.
---

# Remb Cross-Project

You are helping the user work across multiple Remb projects — searching for patterns in other repos, loading external context, and transferring knowledge.

## Cross-Project Search

Find features, context entries, and memories across ALL projects:

```bash
# Search across all your projects
remb context search "authentication pattern"

# Search for a specific pattern
remb context search "rate limiting middleware"
```

This returns matching results from every project, ranked by relevance. Use it when the user says "I did something like this in another project" or "how did I handle X before?"

## Load Another Project's Context

Get the full context bundle for a different project:

```bash
remb context bundle -p other-project-slug
```

This returns the complete knowledge base: features, context entries, memories, tech stack. Use it to understand how another project is structured before applying its patterns.

## Common Workflows

### "Do it like in project X"

1. Search across projects for the concept: `remb context search "auth middleware"`
2. Load the matching project's full context: `remb context bundle -p that-project`
3. Read the relevant patterns and adapt them to the current project
4. Save the adapted pattern as context: `remb save -f "auth" -t pattern -c "Adapted from project X..."`

### Reuse a Pattern

1. List memories from the source project: `remb memory list -p source-project --category pattern`
2. Find the relevant pattern
3. Create a memory in the current project referencing it: `remb memory create --title "Rate Limiting" --content "Same approach as in api-gateway project..." --category pattern`

### Compare Approaches

1. Load context for both projects
2. Compare how each handles the same feature
3. Pick the better approach and document the decision

## Projects Management

```bash
# List all your projects
remb projects

# Get details about a specific project
remb projects info -p my-project
```

## Global Memories

Create memories that apply to ALL projects — useful for personal coding standards:

```bash
remb memory create --title "TypeScript Style" --content "Always use strict mode, prefer interfaces over types, use zod for validation" --category preference --tier core
```

Global memories (created without `-p`) are loaded in every project session.

## Best Practices

1. **Name projects descriptively** — slugs like `api-gateway`, `user-dashboard` are searchable
2. **Save patterns as memories** — when you solve something elegantly, save it for future reuse
3. **Cross-reference in context** — mention related projects in context entries: "Same auth pattern as in `api-gateway` project"
4. **Use global memories for standards** — personal preferences should be global, not per-project
