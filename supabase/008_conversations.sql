-- 008: Conversation history tracking
-- Stores AI conversation entries (summaries, tool calls, milestones)
-- for persistent session awareness across IDEs, CLI, and web.

create table if not exists conversation_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  session_id  text not null,
  type        text not null default 'summary'
              check (type in ('summary', 'tool_call', 'milestone')),
  content     text not null,
  metadata    jsonb default '{}',
  source      text not null default 'mcp'
              check (source in ('mcp', 'cli', 'web', 'api')),
  created_at  timestamptz not null default now()
);

-- Primary query path: user's recent history
create index idx_conversation_entries_user_date
  on conversation_entries (user_id, created_at desc);

-- Filtered by project
create index idx_conversation_entries_user_project_date
  on conversation_entries (user_id, project_id, created_at desc);

-- Session grouping
create index idx_conversation_entries_user_session
  on conversation_entries (user_id, session_id);

-- RLS
alter table conversation_entries enable row level security;

create policy "Users can read own conversation entries"
  on conversation_entries for select
  using (user_id = auth.uid());

create policy "Users can insert own conversation entries"
  on conversation_entries for insert
  with check (user_id = auth.uid());

create policy "Users can delete own conversation entries"
  on conversation_entries for delete
  using (user_id = auth.uid());
