-- RPC function for semantic dedup: find context entries similar to a given embedding
-- within a specific feature. Used by scan-runner to avoid creating near-duplicate entries.
create or replace function match_context_entries(
  query_embedding vector(1536),
  match_threshold float default 0.95,
  match_count int default 1,
  p_feature_id uuid default null
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ce.id,
    ce.content,
    ce.metadata,
    1 - (ce.embedding <=> query_embedding) as similarity
  from context_entries ce
  where ce.embedding is not null
    and (p_feature_id is null or ce.feature_id = p_feature_id)
    and 1 - (ce.embedding <=> query_embedding) > match_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
end;
$$;
