-- Memory system: tiered context for AI agents
-- Tiers: core (always loaded), active (on-demand), archive (compressed long-term)

create table if not exists memories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  project_id  uuid references projects(id) on delete cascade, -- null = global memory
  tier        text not null default 'active' check (tier in ('core', 'active', 'archive')),
  category    text not null default 'general' check (category in ('preference', 'pattern', 'decision', 'correction', 'knowledge', 'general')),
  title       text not null,
  content     text not null,
  compressed_content text, -- refined/summarized version for archive tier
  tags        text[] not null default '{}',
  access_count integer not null default 0,
  token_count  integer not null default 0, -- estimated tokens for budget tracking
  last_accessed_at timestamptz,
  embedding   vector(1536), -- for semantic retrieval
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Indexes
create index if not exists memories_user_id_idx on memories(user_id);
create index if not exists memories_project_id_idx on memories(project_id);
create index if not exists memories_tier_idx on memories(user_id, tier);
create index if not exists memories_category_idx on memories(user_id, category);

-- Auto update updated_at
create or replace trigger memories_updated_at
  before update on memories
  for each row execute function handle_updated_at();

-- Semantic search across memories
create or replace function search_memories(
  p_user_id uuid,
  p_project_id uuid default null,
  query_embedding vector(1536) default null,
  match_count int default 10,
  p_tier text default null
)
returns table (
  id uuid,
  tier text,
  category text,
  title text,
  content text,
  compressed_content text,
  tags text[],
  token_count integer,
  access_count integer,
  similarity float
)
language plpgsql
as $$
begin
  return query
    select
      m.id, m.tier, m.category, m.title,
      m.content, m.compressed_content, m.tags,
      m.token_count, m.access_count,
      case when query_embedding is not null
        then 1 - (m.embedding <=> query_embedding)
        else 1.0
      end as similarity
    from memories m
    where m.user_id = p_user_id
      and (p_project_id is null or m.project_id is null or m.project_id = p_project_id)
      and (p_tier is null or m.tier = p_tier)
    order by
      case when query_embedding is not null then m.embedding <=> query_embedding else 0 end asc
    limit match_count;
end;
$$;

-- IVFFlat index for fast vector search on memories
create index if not exists memories_embedding_idx on memories
  using ivfflat (embedding vector_cosine_ops) with (lists = 50);
