-- Remb — Migration 002: pgvector, embeddings, and github token
-- Run this in Supabase → SQL Editor after 001_initial_schema.sql

-- ─── Enable pgvector extension ─────────────────────────────────────────────
create extension if not exists vector with schema extensions;

-- ─── Add github_token to users ─────────────────────────────────────────────
alter table users add column if not exists github_token text;

-- ─── Add embedding column to context_entries ───────────────────────────────
alter table context_entries add column if not exists embedding vector(1536);

-- ─── Semantic search function ──────────────────────────────────────────────
-- Call: select * from search_context('project-uuid', '[0.01, 0.02, ...]'::vector, 10);
create or replace function search_context(
  p_project_id uuid,
  query_embedding vector(1536),
  match_count int default 10
)
returns table (
  id uuid,
  feature_id uuid,
  content text,
  entry_type text,
  source text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
    select
      ce.id,
      ce.feature_id,
      ce.content,
      ce.entry_type,
      ce.source,
      ce.metadata,
      1 - (ce.embedding <=> query_embedding) as similarity
    from context_entries ce
    join features f on f.id = ce.feature_id
    where f.project_id = p_project_id
      and ce.embedding is not null
    order by ce.embedding <=> query_embedding
    limit match_count;
end;
$$;
