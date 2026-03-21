-- 023: Conversation threads
-- Groups related conversation entries into logical threads for continuity.
-- A thread represents a coherent topic or task across one or more sessions.

-- ─── Thread ID column ──────────────────────────────────────────────────────

alter table conversation_entries
  add column if not exists thread_id uuid;

-- Index for thread-based queries
create index if not exists idx_conversation_entries_thread
  on conversation_entries (user_id, thread_id, created_at desc)
  where thread_id is not null;

-- ─── Thread assignment function ────────────────────────────────────────────
-- Given a new conversation entry's embedding, finds the best matching recent
-- thread (within 7 days, cosine similarity > 0.75). Returns the thread_id
-- to assign, or NULL if a new thread should be created.

create or replace function find_conversation_thread(
  p_user_id        uuid,
  p_project_id     uuid,
  query_embedding  vector(1536),
  similarity_min   float default 0.75,
  lookback_days    int default 7
)
returns uuid
language plpgsql
as $$
declare
  matched_thread uuid;
begin
  -- Find the most similar recent conversation entry that has a thread_id
  select ce.thread_id into matched_thread
  from conversation_entries ce
  where ce.user_id = p_user_id
    and (p_project_id is null or ce.project_id = p_project_id)
    and ce.thread_id is not null
    and ce.embedding is not null
    and ce.created_at > now() - make_interval(days => lookback_days)
    and (1 - (ce.embedding <=> query_embedding)) >= similarity_min
  order by ce.embedding <=> query_embedding
  limit 1;

  return matched_thread;
end;
$$;

-- ─── Thread history function ───────────────────────────────────────────────
-- Returns all entries in a thread, ordered chronologically.

create or replace function get_thread_entries(
  p_user_id   uuid,
  p_thread_id uuid,
  max_entries  int default 50
)
returns table (
  id          uuid,
  session_id  text,
  type        text,
  content     text,
  tags        text[],
  metadata    jsonb,
  source      text,
  created_at  timestamptz
)
language plpgsql
as $$
begin
  return query
    select
      ce.id,
      ce.session_id,
      ce.type,
      ce.content,
      ce.tags,
      ce.metadata,
      ce.source,
      ce.created_at
    from conversation_entries ce
    where ce.user_id = p_user_id
      and ce.thread_id = p_thread_id
    order by ce.created_at asc
    limit max_entries;
end;
$$;

-- ─── Backfill: assign thread_id to all existing entries without one ────────
-- Each entry gets its own thread_id initially. The find_conversation_thread
-- function will cluster new entries into existing threads going forward.
update conversation_entries
  set thread_id = id
  where thread_id is null;
