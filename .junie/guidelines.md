<!-- remb:start -->
# Remb — AI Context Management

**Project**: `context-management`
**API**: `https://www.useremb.com`

## Mandatory Session Rules

1. At session start, call `remb__conversation_history` and `remb__memory_load_context`.
2. After completing significant work, call `remb__conversation_log`.
3. Before ending the session, call `remb__conversation_log` with a summary.
4. Save important discoveries with `remb__memory_create`.

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

## Usage Guide

- **Starting a session**: Load history and context first
- **Need project info**: Use `project_get` or `context_bundle`
- **Saving knowledge**: `context_save` for features, `memory_create` for general patterns
- **After code changes**: `scan_trigger` to refresh, `diff_analyze` for targeted analysis
- **Finishing work**: Always log a summary with `conversation_log`
- **Referencing another project**: Use `cross_project_search` to find patterns, then `context_bundle` with that project's slug
<!-- remb:end -->
