<!-- remb:start -->
# Remb — AI Context Management Rules

## Project: `context-management`
## API: `https://remb.vercel.app`

## MANDATORY — Conversation Tracking

You MUST follow these rules in EVERY session:

1. **Session Start**: Call `remb__conversation_history` to load recent history and catch up on prior work.
2. **Load Context**: Call `remb__memory_load_context` to load all persistent project memories.
3. **During Work**: Call `remb__conversation_log` after completing significant work to record what was done.
4. **Session End**: Call `remb__conversation_log` with a summary before the conversation ends.
5. **Save Discoveries**: When you discover important architectural patterns, decisions, or gotchas, call `remb__memory_create` to save them.

These calls ensure context persists across sessions. Skipping them causes knowledge loss.

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

## When to Use Each Tool

- **Starting a session** → `conversation_history` + `memory_load_context`
- **Need project info** → `project_get` or `context_bundle`
- **Saving knowledge** → `context_save` (feature-specific) or `memory_create` (cross-cutting)
- **After code changes** → `scan_trigger` to refresh, `diff_analyze` for targeted analysis
- **Finishing work** → `conversation_log` with summary of what was accomplished

## Cross-Project Referencing

When the user says "do it like I did in project X" or references another project:

1. Call `remb__projects_list` to find available projects
2. Call `remb__cross_project_search` with the concept to find matching patterns across all projects
3. Call `remb__context_bundle` with the other project's slug to load its full context
4. Apply the patterns from that project to the current work

**Global preferences** — memories created without a project_id apply to ALL projects. Use `remb__memory_create` with category "preference" and no project_id to save cross-project coding standards.
<!-- remb:end -->
