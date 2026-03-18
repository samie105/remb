-- 016: Add embeddings, tags, and smart search to conversation_entries
-- Enables AI-summarized, deduplicated, semantically searchable conversations.

-- ─── New columns ───────────────────────────────────────────────────────────

-- Vector embedding for semantic search / dedup
alter table conversation_entries
  add column if not exists embedding vector(1536);

--  Free-form tags for filtering (e.g. ['auth', 'bug-fix', 'refactor'])
alter table conversation_entries
  add column if not exists tags text[] default '{}';

-- Denormalized project slug for fast cross-project querying
alter table conversation_entries
  add column if not exists project_slug text;

-- Whether this entry was AI-summarized (vs raw dump)
alter table conversation_entries
  add column if not exists is_summarized boolean default false;

-- Allow 'conversation' as a type (AI-summarized conversation digest)
alter table conversation_entries
  drop constraint if exists conversation_entries_type_check;
alter table conversation_entries
  add constraint conversation_entries_type_check
  check (type in ('summary', 'tool_call', 'milestone', 'conversation'));

-- ─── Indexes ───────────────────────────────────────────────────────────────

-- IVFFlat vector index for semantic search
create index if not exists conversation_entries_embedding_idx
  on conversation_entries
  using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- GIN index for tag filtering
create index if not exists conversation_entries_tags_idx
  on conversation_entries using gin (tags);

-- Project slug lookup
create index if not exists conversation_entries_project_slug_idx
  on conversation_entries (user_id, project_slug, created_at desc);

-- ─── Semantic search function ──────────────────────────────────────────────

create or replace function search_conversations(
  p_user_id         uuid,
  query_embedding   vector(1536),
  match_count       int default 10,
  p_project_slug    text default null,
  p_tags            text[] default null,
  similarity_threshold float default 0.3
)
returns table (
  id          uuid,
  project_id  uuid,
  project_slug text,
  session_id  text,
  type        text,
  content     text,
  tags        text[],
  metadata    jsonb,
  source      text,
  created_at  timestamptz,
  similarity  float
)
language plpgsql
as $$
begin
  return query
    select
      ce.id,
      ce.project_id,
      ce.project_slug,
      ce.session_id,
      ce.type,
      ce.content,
      ce.tags,
      ce.metadata,
      ce.source,
      ce.created_at,
      (1 - (ce.embedding <=> query_embedding))::float as similarity
    from conversation_entries ce
    where ce.user_id = p_user_id
      and ce.embedding is not null
      and (p_project_slug is null or ce.project_slug = p_project_slug)
      and (p_tags is null or ce.tags && p_tags)
      and (1 - (ce.embedding <=> query_embedding)) >= similarity_threshold
    order by ce.embedding <=> query_embedding
    limit match_count;
end;
$$;

-- ─── Dedup check: find similar recent entries for same project ─────────────

create or replace function find_duplicate_conversation(
  p_user_id       uuid,
  p_project_slug  text,
  query_embedding vector(1536),
  threshold       float default 0.92,
  lookback_hours  int default 24
)
returns table (
  id         uuid,
  content    text,
  similarity float
)
language plpgsql
as $$
begin
  return query
    select
      ce.id,
      ce.content,
      (1 - (ce.embedding <=> query_embedding))::float as similarity
    from conversation_entries ce
    where ce.user_id = p_user_id
      and ce.embedding is not null
      and (p_project_slug is null or ce.project_slug = p_project_slug)
      and ce.created_at > now() - make_interval(hours => lookback_hours)
      and (1 - (ce.embedding <=> query_embedding)) >= threshold
    order by ce.embedding <=> query_embedding
    limit 1;
end;
$$;

-- ─── Allow updates for dedup merging ───────────────────────────────────────

create policy "Users can update own conversation entries"
  on conversation_entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
