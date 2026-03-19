-- 017: Relational context enhancements
-- Links memories and conversations to specific features for smarter retrieval.
-- Adds conversation recency weighting to context bundle assembly.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. MEMORIES → FEATURE (optional FK)
--    Allows memories to be scoped to a specific feature within a project.
-- ═════════════════════════════════════════════════════════════════════════════

alter table memories
  add column if not exists feature_id uuid references features(id) on delete set null;

create index if not exists memories_feature_id_idx on memories(feature_id)
  where feature_id is not null;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. CONVERSATIONS → FEATURE (optional FK)
--    Allows conversation entries to reference the feature they discuss.
-- ═════════════════════════════════════════════════════════════════════════════

alter table conversation_entries
  add column if not exists feature_id uuid references features(id) on delete set null;

create index if not exists conversation_entries_feature_id_idx
  on conversation_entries(feature_id)
  where feature_id is not null;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. CONVERSATION RECENCY BOOST
--    View that maps features to their most recent conversation activity.
--    Used by context bundle assembly to boost recently-discussed features.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace view feature_conversation_recency as
select
  ce.feature_id,
  max(ce.created_at) as last_discussed_at,
  count(*)::int       as discussion_count
from conversation_entries ce
where ce.feature_id is not null
group by ce.feature_id;


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. ENHANCED build_context_bundle — adds conversation recency boost
--    Features discussed in the last 24h get a +100 priority boost.
--    Features discussed in the last 7d get a +50 priority boost.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function build_context_bundle(
  p_user_id       uuid,
  p_project_id    uuid    default null,
  query_embedding vector(1536) default null,
  token_budget    int     default 16000
)
returns table (
  id                uuid,
  tier              text,
  category          text,
  title             text,
  content           text,
  compressed_content text,
  tags              text[],
  token_count       integer,
  access_count      integer,
  feature_id        uuid,
  priority_score    float,
  cumulative_tokens bigint
)
language sql stable
as $$
  with ranked as (
    select
      m.id,
      m.tier,
      m.category,
      m.title,
      m.content,
      m.compressed_content,
      m.tags,
      m.token_count,
      m.access_count,
      m.feature_id,
      (
        -- Tier base score
        case m.tier
          when 'core'    then 1000
          when 'active'  then 500
          when 'archive' then 100
        end
        -- Access frequency
        + m.access_count * 2
        -- Recency bonus
        + case when m.last_accessed_at > now() - interval '7 days' then 50 else 0 end
        -- Semantic relevance (0–200)
        + case
            when query_embedding is not null and m.embedding is not null
            then (1 - (m.embedding <=> query_embedding)) * 200
            else 0
          end
        -- Conversation recency boost (feature was recently discussed)
        + coalesce((
            select
              case
                when fcr.last_discussed_at > now() - interval '1 day'  then 100
                when fcr.last_discussed_at > now() - interval '7 days' then 50
                else 0
              end
            from feature_conversation_recency fcr
            where fcr.feature_id = m.feature_id
          ), 0)
      )::float as priority_score
    from memories m
    where m.user_id = p_user_id
      and (p_project_id is null or m.project_id = p_project_id or m.project_id is null)
  )
  select
    r.id, r.tier, r.category, r.title, r.content, r.compressed_content,
    r.tags, r.token_count, r.access_count, r.feature_id, r.priority_score,
    sum(r.token_count) over (order by r.priority_score desc rows unbounded preceding) as cumulative_tokens
  from ranked r
  where sum(r.token_count) over (order by r.priority_score desc rows unbounded preceding) <= token_budget
  order by r.priority_score desc;
$$;
