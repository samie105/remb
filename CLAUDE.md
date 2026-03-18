<!-- remb:start -->
# Remb — AI Context Management

**Project**: `context-management` | **API**: `http://localhost:3000`

## MANDATORY — Follow These in EVERY Session

1. At session start, call `remb__conversation_history` to load prior session context.
2. At session start, call `remb__memory_load_context` to load all project memories.
3. After completing significant work, call `remb__conversation_log` to record it.
4. Before ending the session, call `remb__conversation_log` with a final summary.
5. Save important patterns/decisions with `remb__memory_create`.

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

## Cross-Project

When told "implement it like in project X", use `cross_project_search` to find patterns, then `context_bundle` with the other project's slug.
<!-- remb:end -->
