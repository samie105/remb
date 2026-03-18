-- ─────────────────────────────────────────────────────────────────────────────
-- 012: Smart Indexes, Storage Limits & AI Context Optimization
--
-- Goals:
--   1. HNSW vector index on memories (replaces IVFFlat — faster, better recall)
--   2. IVFFlat vector index on context_entries (was completely missing)
--   3. GIN indexes for array/JSONB filtering (tags, metadata)
--   4. Composite partial indexes for the hottest query paths
--   5. Plan-limits table — per-plan storage & token budgets
--   6. DB-level hard-cap CHECK constraints on text columns (NOT VALID = new rows only)
--   7. user_storage_stats view — instant quota visibility
--   8. build_context_bundle() — token-budget-aware context assembly
--   9. touch_memories()       — atomic batch access tracking (replaces app-layer loop)
--  10. auto_archive_stale_memories() — demote inactive low-importance memories
--  11. trim_old_conversations()      — keep conversation history bounded
--  12. find_duplicate_memories()     — surface near-duplicate memories for dedup
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. PLAN LIMITS TABLE
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists plan_limits (
  plan                              text primary key,  -- free | pro | team
  max_projects                      int  not null,
  max_memories                      int  not null,   -- per user (all projects)
  max_context_entries_per_project   int  not null,
  max_conversations                 int  not null,   -- total per user
  max_memory_bytes                  int  not null,   -- per memory.content field
  max_context_bytes                 int  not null,   -- per context_entry.content
  max_token_budget                  int  not null    -- max tokens in context bundle
);

insert into plan_limits (plan, max_projects, max_memories, max_context_entries_per_project, max_conversations, max_memory_bytes, max_context_bytes, max_token_budget)
values
  ('free',  3,    50,   200,   500,   4096,   8192,   16000),
  ('pro',   20,   500,  2000,  5000,  16384,  32768,  64000),
  ('team',  100,  2000, 10000, 20000, 32768,  65536,  128000)
on conflict (plan) do update
  set max_projects                    = excluded.max_projects,
      max_memories                    = excluded.max_memories,
      max_context_entries_per_project = excluded.max_context_entries_per_project,
      max_conversations               = excluded.max_conversations,
      max_memory_bytes                = excluded.max_memory_bytes,
      max_context_bytes               = excluded.max_context_bytes,
      max_token_budget                = excluded.max_token_budget;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. DB-LEVEL HARD-CAP CHECK CONSTRAINTS
--    NOT VALID → enforced on new/updated rows only; existing data is not scanned.
--    These are absolute floors; app-layer enforces plan-specific limits above these.
-- ═════════════════════════════════════════════════════════════════════════════

-- memories
alter table memories
  add constraint if not exists memories_content_hard_cap
    check (octet_length(content) <= 65536) not valid;           -- 64 KB hard cap

alter table memories
  add constraint if not exists memories_compressed_content_hard_cap
    check (compressed_content is null or octet_length(compressed_content) <= 32768) not valid;

alter table memories
  add constraint if not exists memories_title_hard_cap
    check (octet_length(title) <= 1024) not valid;              -- 1 KB hard cap

-- context_entries
alter table context_entries
  add constraint if not exists context_entries_content_hard_cap
    check (octet_length(content) <= 131072) not valid;          -- 128 KB hard cap

-- conversation_entries
alter table conversation_entries
  add constraint if not exists conversation_entries_content_hard_cap
    check (octet_length(content) <= 32768) not valid;           -- 32 KB hard cap

-- features
alter table features
  add constraint if not exists features_name_hard_cap
    check (octet_length(name) <= 512) not valid;

-- projects
alter table projects
  add constraint if not exists projects_slug_hard_cap
    check (octet_length(slug) <= 128) not valid;

alter table projects
  add constraint if not exists projects_name_hard_cap
    check (octet_length(name) <= 256) not valid;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. VECTOR INDEXES
-- ═════════════════════════════════════════════════════════════════════════════

-- 3a. Replace IVFFlat on memories with HNSW.
--     HNSW delivers lower query latency and higher recall at the same QPS.
--     m=16 / ef_construction=64 is a good default for up to ~1M rows.
drop index if exists memories_embedding_idx;

create index if not exists memories_embedding_hnsw_idx
  on memories using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 3b. context_entries was missing a vector index entirely — adding IVFFlat.
--     lists=100 suits datasets of up to ~100K entries per deployment.
create index if not exists context_entries_embedding_ivfflat_idx
  on context_entries using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. GIN INDEXES — fast array & JSONB filtering
-- ═════════════════════════════════════════════════════════════════════════════

-- memories.tags — supports @> ANY-contains queries
create index if not exists memories_tags_gin_idx
  on memories using gin (tags);

-- context_entries.metadata — supports jsonb_path_ops for key/value lookup
create index if not exists context_entries_metadata_gin_idx
  on context_entries using gin (metadata jsonb_path_ops);


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. COMPOSITE & PARTIAL INDEXES for hot query paths
-- ═════════════════════════════════════════════════════════════════════════════

-- Most critical path: load ALL core memories for a user (always included in AI context)
create index if not exists memories_user_core_access_idx
  on memories (user_id, access_count desc)
  where tier = 'core';

-- Active memories ranked by access frequency + project scope
create index if not exists memories_user_active_idx
  on memories (user_id, project_id, access_count desc)
  where tier = 'active';

-- Token-budget lookups: quickly sum token costs by tier
create index if not exists memories_user_tier_tokens_idx
  on memories (user_id, tier, token_count);

-- Context entries: most recent first per feature (dashboard + CLI get queries)
create index if not exists context_entries_feature_date_idx
  on context_entries (feature_id, created_at desc);

-- Context entries by type (manual|scan|decision|fix) for filtering
create index if not exists context_entries_type_date_idx
  on context_entries (entry_type, created_at desc);

-- Conversations: oldest-first for trim queries
create index if not exists conversation_entries_user_oldest_idx
  on conversation_entries (user_id, created_at asc);

-- Scan jobs: latest done scan per project
create index if not exists scan_jobs_project_status_date_idx
  on scan_jobs (project_id, status, created_at desc);


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. USER STORAGE STATS VIEW
--    Answers: "how much space is this user consuming vs. their plan?"
-- ═════════════════════════════════════════════════════════════════════════════

create or replace view user_storage_stats as
select
  u.id                                                          as user_id,
  u.plan,
  -- memories
  count(distinct m.id)::int                                     as memory_count,
  coalesce(sum(m.token_count), 0)::int                          as total_memory_tokens,
  coalesce(sum(octet_length(m.content)), 0)::bigint             as memory_bytes,
  -- context entries (counted via project ownership)
  (
    select count(*)::int
    from context_entries ce
    join features f   on f.id  = ce.feature_id
    join projects prj on prj.id = f.project_id
    where prj.user_id = u.id
  )                                                             as context_entry_count,
  (
    select coalesce(sum(octet_length(ce.content)), 0)::bigint
    from context_entries ce
    join features f   on f.id  = ce.feature_id
    join projects prj on prj.id = f.project_id
    where prj.user_id = u.id
  )                                                             as context_bytes,
  -- conversations
  (
    select count(*)::int
    from conversation_entries conv
    where conv.user_id = u.id
  )                                                             as conversation_entry_count,
  -- projects
  count(distinct proj.id)::int                                  as project_count,
  -- plan limits (joined)
  pl.max_projects,
  pl.max_memories,
  pl.max_context_entries_per_project,
  pl.max_conversations,
  pl.max_memory_bytes,
  pl.max_context_bytes,
  pl.max_token_budget
from users u
left join memories m   on m.user_id   = u.id
left join projects proj on proj.user_id = u.id
left join plan_limits pl on pl.plan     = u.plan
group by
  u.id, u.plan,
  pl.max_projects, pl.max_memories, pl.max_context_entries_per_project,
  pl.max_conversations, pl.max_memory_bytes, pl.max_context_bytes, pl.max_token_budget;


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. touch_memories() — atomic batch access tracking
--    Replaces the app-layer loop that did one UPDATE per memory.
--    Call after any context load to drive tier-promotion signals.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function touch_memories(memory_ids uuid[])
returns void
language sql
as $$
  update memories
  set
    access_count     = access_count + 1,
    last_accessed_at = now()
  where id = any(memory_ids);
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 8. build_context_bundle() — token-budget-aware context assembly
--
--    Priority formula weighting (higher = included first):
--      tier:     core→1000, active→500, archive→100
--      access:   +2 per access_count (frequently used = valuable)
--      semantic: +0–200 when query_embedding is provided (relevance)
--      recency:  +50 if accessed in last 7 days
--
--    For archive-tier memories (rarely needed), compressed_content is used
--    instead of full content to conserve tokens.
--
--    Usage:
--      select * from build_context_bundle(
--        p_user_id        => '<uuid>',
--        p_project_id     => '<uuid>',       -- optional
--        query_embedding  => '<vector>',      -- optional; enables semantic rank
--        token_budget     => 32000
--      );
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function build_context_bundle(
  p_user_id       uuid,
  p_project_id    uuid    default null,
  query_embedding vector(1536) default null,
  token_budget    int     default 32000
)
returns table (
  id               uuid,
  tier             text,
  category         text,
  title            text,
  content          text,
  tags             text[],
  token_count      int,
  access_count     int,
  similarity       float,
  cumulative_tokens bigint
)
language plpgsql
as $$
begin
  return query
    with ranked as (
      select
        m.id,
        m.tier,
        m.category,
        m.title,
        -- Use compressed_content for archive tier when available (saves tokens)
        coalesce(
          case when m.tier = 'archive' then m.compressed_content else null end,
          m.content
        )::text as content,
        m.tags,
        -- Recompute token estimate using the content we'll actually serve
        ceil(
          octet_length(
            coalesce(
              case when m.tier = 'archive' then m.compressed_content else null end,
              m.content
            )
          )::float / 4
        )::int as token_count,
        m.access_count,
        -- Semantic similarity (0.5 default when no query provided)
        case
          when query_embedding is not null
            then 1 - (m.embedding <=> query_embedding)
          else 0.5
        end::float as similarity,
        -- Priority score driving inclusion order
        (
          case m.tier
            when 'core'    then 1000
            when 'active'  then 500
            when 'archive' then 100
          end
          + (m.access_count * 2)
          + case
              when query_embedding is not null
                then ((1 - (m.embedding <=> query_embedding)) * 200)::int
              else 0
            end
          + case when m.last_accessed_at > now() - interval '7 days' then 50 else 0 end
        ) as priority_score
      from memories m
      where m.user_id = p_user_id
        -- Include global memories (project_id IS NULL) and project-specific ones
        and (
          p_project_id is null
          or m.project_id is null
          or m.project_id = p_project_id
        )
        -- Skip archive unless a semantic query is provided (it's compressed anyway)
        and (m.tier != 'archive' or query_embedding is not null)
    ),
    windowed as (
      select
        r.*,
        sum(r.token_count) over (
          order by r.priority_score desc
          rows between unbounded preceding and current row
        ) as cumulative_tokens
      from ranked r
    )
    select
      w.id,
      w.tier,
      w.category,
      w.title,
      w.content,
      w.tags,
      w.token_count,
      w.access_count,
      w.similarity,
      w.cumulative_tokens
    from windowed w
    where w.cumulative_tokens <= token_budget
    order by
      case w.tier when 'core' then 1 when 'active' then 2 else 3 end,
      w.priority_score desc;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 9. auto_archive_stale_memories()
--    Demotes active memories that haven't been touched in 60 days and were
--    accessed fewer than 3 times — they probably aren't helping the AI.
--    Call via a scheduled job (pg_cron or Edge Function) once per day.
--    Returns the number of memories demoted.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function auto_archive_stale_memories()
returns int
language plpgsql
as $$
declare
  rows_updated int;
begin
  update memories
  set
    tier = 'archive',
    compressed_content = case
      when compressed_content is not null then compressed_content
      -- Minimal truncation-based compression: first 500 chars (good enough for auto-archive)
      else left(content, 500) || case when length(content) > 500 then ' …' else '' end
    end,
    updated_at = now()
  where tier   = 'active'
    and access_count < 3
    and (
      last_accessed_at < now() - interval '60 days'
      or (last_accessed_at is null and created_at < now() - interval '60 days')
    );

  get diagnostics rows_updated = row_count;
  return rows_updated;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 10. trim_old_conversations()
--     Deletes the oldest conversation entries beyond keep_count per user.
--     Default keep_count aligns with plan limits but can be overridden.
--     Returns the number of entries deleted.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function trim_old_conversations(
  p_user_id  uuid,
  keep_count int default 1000
)
returns int
language plpgsql
as $$
declare
  rows_deleted int;
begin
  with ranked as (
    select id,
           row_number() over (order by created_at desc) as rn
    from conversation_entries
    where user_id = p_user_id
  )
  delete from conversation_entries
  where id in (select id from ranked where rn > keep_count);

  get diagnostics rows_deleted = row_count;
  return rows_deleted;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 11. find_duplicate_memories()
--     Returns pairs of memories whose embeddings are cosine-similar above the
--     threshold. Useful for a dedup UI or automated cleanup job.
--     Capped at 50 pairs to avoid unbounded scans.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function find_duplicate_memories(
  p_user_id            uuid,
  p_project_id         uuid  default null,
  similarity_threshold float default 0.92
)
returns table (
  memory_a_id uuid,
  memory_b_id uuid,
  title_a     text,
  title_b     text,
  similarity  float
)
language sql
as $$
  select
    a.id    as memory_a_id,
    b.id    as memory_b_id,
    a.title as title_a,
    b.title as title_b,
    (1 - (a.embedding <=> b.embedding))::float as similarity
  from memories a
  join memories b on a.id < b.id   -- natural dedup: each pair appears once
  where a.user_id = p_user_id
    and b.user_id = p_user_id
    and (
      p_project_id is null
      or (
        (a.project_id = p_project_id or a.project_id is null)
        and (b.project_id = p_project_id or b.project_id is null)
      )
    )
    and a.embedding is not null
    and b.embedding is not null
    and (1 - (a.embedding <=> b.embedding)) >= similarity_threshold
  order by similarity desc
  limit 50;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 12. check_memory_quota() — quick boolean guard for app-layer quota checks
--     Returns true if the user is still under their plan's memory limit.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function check_memory_quota(p_user_id uuid)
returns boolean
language sql
stable
as $$
  select s.memory_count < s.max_memories
  from user_storage_stats s
  where s.user_id = p_user_id;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 13. Improve search_context to also leverage the new vector index hint
--     (no functional change; add EXPLAIN-friendly comment + null-embedding guard)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function search_context(
  p_project_id    uuid,
  query_embedding vector(1536),
  match_count     int default 10
)
returns table (
  id          uuid,
  feature_id  uuid,
  content     text,
  entry_type  text,
  source      text,
  metadata    jsonb,
  similarity  float
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
      (1 - (ce.embedding <=> query_embedding))::float as similarity
    from context_entries ce
    join features f on f.id = ce.feature_id
    where f.project_id    = p_project_id
      and ce.embedding   is not null        -- only indexed rows; skips unembedded entries
    order by ce.embedding <=> query_embedding
    limit match_count;
end;
$$;
