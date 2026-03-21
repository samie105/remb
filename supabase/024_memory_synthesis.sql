-- Migration 024: Memory synthesis — find related-but-distinct memory clusters
-- These are memories with cosine similarity 0.70–0.87 (related but not duplicates)

create or replace function find_memory_clusters(
  p_user_id uuid,
  p_similarity_min float default 0.70,
  p_similarity_max float default 0.87,
  p_min_cluster_size int default 3,
  p_max_clusters int default 10
)
returns table (
  cluster_id int,
  memory_id uuid,
  title text,
  content text,
  category text,
  tier text,
  similarity_to_centroid float
)
language plpgsql
as $$
declare
  rec record;
  visited uuid[] := '{}';
  cluster_num int := 0;
begin
  -- For each unvisited core/active memory, find its neighbors in the similarity band
  for rec in
    select m.id, m.title, m.content, m.category, m.tier, m.embedding
    from memories m
    where m.user_id = p_user_id
      and m.tier in ('core', 'active')
      and m.embedding is not null
    order by m.access_count desc, m.created_at desc
    limit 200
  loop
    -- Skip already-clustered memories
    if rec.id = any(visited) then continue; end if;

    -- Find neighbors in the similarity band (related but not duplicate)
    if (
      select count(*) from memories m2
      where m2.user_id = p_user_id
        and m2.tier in ('core', 'active')
        and m2.id != rec.id
        and not (m2.id = any(visited))
        and m2.embedding is not null
        and 1 - (m2.embedding <=> rec.embedding) between p_similarity_min and p_similarity_max
    ) >= (p_min_cluster_size - 1) then
      cluster_num := cluster_num + 1;

      -- Return the seed memory
      cluster_id := cluster_num;
      memory_id := rec.id;
      title := rec.title;
      content := rec.content;
      category := rec.category;
      tier := rec.tier;
      similarity_to_centroid := 1.0;
      visited := visited || rec.id;
      return next;

      -- Return its neighbors
      for memory_id, title, content, category, tier, similarity_to_centroid in
        select m2.id, m2.title, m2.content, m2.category, m2.tier,
               1 - (m2.embedding <=> rec.embedding) as sim
        from memories m2
        where m2.user_id = p_user_id
          and m2.tier in ('core', 'active')
          and m2.id != rec.id
          and not (m2.id = any(visited))
          and m2.embedding is not null
          and 1 - (m2.embedding <=> rec.embedding) between p_similarity_min and p_similarity_max
        order by sim desc
        limit 10
      loop
        cluster_id := cluster_num;
        visited := visited || memory_id;
        return next;
      end loop;

      if cluster_num >= p_max_clusters then exit; end if;
    end if;
  end loop;
end;
$$;
