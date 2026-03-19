---
applyTo: '**'
---

<!-- remb:start -->
# Remb — Mandatory Session Protocol

**Project**: `context-management` | **API**: `https://www.useremb.com`

## MANDATORY — Follow These in EVERY Session

### Session Start (do this FIRST, before anything else)
1. Call `remb__conversation_history` — load what was discussed and done in prior sessions
2. Call `remb__memory_load_context` — load all persistent project memories (core + active tier)

### During Work
3. Call `remb__conversation_log` after completing any significant task, bug fix, or feature
4. Call `remb__memory_create` when you discover important patterns, decisions, or gotchas worth keeping

### Session End (do this LAST, before the conversation ends)
5. Call `remb__conversation_log` with a summary: what was asked, what was done, key decisions made

Skipping these causes knowledge loss across sessions. The user expects you to follow this automatically.

---

### Available MCP Tools

**Memory Management:**
- `remb__memory_list` — list memories (filter by tier, category, search)
- `remb__memory_search` — semantic search across all memories
- `remb__memory_load_context` — load all core + active memories as context
- `remb__memory_create` — create a new memory
- `remb__memory_update` — update an existing memory
- `remb__memory_delete` — delete a memory
- `remb__memory_promote` — promote a memory to a higher tier
- `remb__memory_stats` — get memory usage statistics
- `remb__memory_image_upload` — upload an image to memory
- `remb__memory_image_list` — list stored images

**Conversation Tracking:**
- `remb__conversation_log` — record what you discussed or accomplished
- `remb__conversation_history` — load recent conversation history

**Project & Context:**
- `remb__projects_list` — list all projects with feature counts
- `remb__project_get` — get project details, features, and latest scan
- `remb__context_save` — save a context entry for a feature
- `remb__context_get` — retrieve context entries (optional feature filter)
- `remb__context_bundle` — full project context as markdown

**Scanning & Analysis:**
- `remb__scan_trigger` — trigger a cloud scan
- `remb__scan_status` — check scan progress
- `remb__diff_analyze` — analyze a git diff and save extracted changes

**Cross-Project:**
- `remb__cross_project_search` — search across ALL projects for features, context, and memories
- `remb__context_bundle` — also works with other project slugs to load another project's full context
- `remb__memory_create` — create with no project_id to save global preferences that apply everywhere

## When to Use What

| Situation | Tool |
|---|---|
| Starting a session | `conversation_history` + `memory_load_context` |
| Need project info | `project_get` or `context_bundle` |
| Saving knowledge | `context_save` (feature-specific) or `memory_create` (cross-cutting) |
| After code changes | `scan_trigger` or `diff_analyze` |
| Finishing work | `conversation_log` with summary |
| "Do it like in project X" | `cross_project_search` -> `context_bundle` with that project slug |
| Global coding preference | `memory_create` with no `project_id`, category "preference" |

## Memory Tiers

- **core** -- always loaded into every session automatically
- **active** -- loaded on-demand or when relevant to current query
- **archive** -- compressed long-term storage

Save architectural decisions and key patterns as `core` tier so they're always available.
<!-- remb:end -->
