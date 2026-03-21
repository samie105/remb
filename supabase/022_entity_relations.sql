-- 022: Entity relations graph — generic cross-type relationship table
-- Enables traversable knowledge graph across memories, features, context entries,
-- conversations, plans, and file dependencies.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. ENTITY RELATIONS TABLE
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists entity_relations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,

  source_type text not null,  -- 'memory' | 'context_entry' | 'feature' | 'conversation' | 'plan' | 'file_dep'
  source_id   uuid not null,
  target_type text not null,
  target_id   uuid not null,

  relation    text not null,  -- 'informs' | 'contradicts' | 'extends' | 'derived_from' | 'references' | 'depends_on' | 'implements' | 'tests'
  confidence  float not null default 1.0,
  metadata    jsonb not null default '{}',

  created_at  timestamptz not null default now(),

  -- Prevent duplicate relations
  unique(source_type, source_id, target_type, target_id, relation)
);

-- Forward lookups: "what does entity X relate to?"
create index if not exists idx_entity_relations_source
  on entity_relations(project_id, source_type, source_id);

-- Reverse lookups: "what relates to entity Y?"
create index if not exists idx_entity_relations_target
  on entity_relations(project_id, target_type, target_id);

-- User scoping
create index if not exists idx_entity_relations_user
  on entity_relations(user_id);

-- Relation type filtering
create index if not exists idx_entity_relations_relation
  on entity_relations(relation);

-- Enable RLS
alter table entity_relations enable row level security;

-- Users can only see their own relations
create policy entity_relations_user_policy on entity_relations
  for all using (user_id = auth.uid());


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. GRAPH TRAVERSAL FUNCTIONS
-- ═════════════════════════════════════════════════════════════════════════════

-- 2a. Get 1-hop neighbors of any entity
create or replace function get_entity_neighborhood(
  p_user_id     uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_project_id  uuid default null
)
returns table (
  direction     text,      -- 'outgoing' | 'incoming'
  related_type  text,
  related_id    uuid,
  relation      text,
  confidence    float,
  metadata      jsonb
)
language sql stable
as $$
  -- Outgoing relations (this entity → others)
  select
    'outgoing'::text as direction,
    er.target_type   as related_type,
    er.target_id     as related_id,
    er.relation,
    er.confidence,
    er.metadata
  from entity_relations er
  where er.user_id = p_user_id
    and er.source_type = p_entity_type
    and er.source_id = p_entity_id
    and (p_project_id is null or er.project_id = p_project_id)

  union all

  -- Incoming relations (others → this entity)
  select
    'incoming'::text as direction,
    er.source_type   as related_type,
    er.source_id     as related_id,
    er.relation,
    er.confidence,
    er.metadata
  from entity_relations er
  where er.user_id = p_user_id
    and er.target_type = p_entity_type
    and er.target_id = p_entity_id
    and (p_project_id is null or er.project_id = p_project_id);
$$;


-- 2b. Multi-hop traversal using recursive CTE (max 4 hops)
-- Uses plpgsql + cross join lateral to combine outgoing/incoming in one recursive step
-- (PostgreSQL doesn't allow multiple recursive references in a single CTE)
create or replace function get_related_entities(
  p_user_id         uuid,
  p_entity_type     text,
  p_entity_id       uuid,
  p_max_hops        int default 2,
  p_relation_filter text default null,
  p_project_id      uuid default null
)
returns table (
  hop           int,
  entity_type   text,
  entity_id     uuid,
  via_relation  text,
  confidence    float,
  path          text[]
)
language plpgsql stable
as $$
begin
  return query
  with recursive traversal as (
    -- Seed: the starting entity
    select
      0 as hop,
      p_entity_type as entity_type,
      p_entity_id as entity_id,
      ''::text as via_relation,
      1.0::float as confidence,
      array[p_entity_type || ':' || p_entity_id::text] as path

    union all

    -- Expand both directions via lateral subquery
    select
      t.hop + 1,
      nb.related_type,
      nb.related_id,
      nb.relation,
      t.confidence * nb.conf,
      t.path || (nb.related_type || ':' || nb.related_id::text)
    from traversal t
    cross join lateral (
      -- Outgoing
      select er.target_type as related_type, er.target_id as related_id, er.relation, er.confidence as conf
      from entity_relations er
      where er.source_type = t.entity_type
        and er.source_id = t.entity_id
        and er.user_id = p_user_id
        and (p_project_id is null or er.project_id = p_project_id)
        and (p_relation_filter is null or er.relation = p_relation_filter)

      union all

      -- Incoming
      select er.source_type, er.source_id, er.relation, er.confidence
      from entity_relations er
      where er.target_type = t.entity_type
        and er.target_id = t.entity_id
        and er.user_id = p_user_id
        and (p_project_id is null or er.project_id = p_project_id)
        and (p_relation_filter is null or er.relation = p_relation_filter)
    ) nb
    where t.hop < least(p_max_hops, 4)  -- hard cap at 4 hops
      -- Prevent cycles
      and not (nb.related_type || ':' || nb.related_id::text) = any(t.path)
  )
  select
    t.hop,
    t.entity_type,
    t.entity_id,
    t.via_relation,
    t.confidence,
    t.path
  from traversal t
  where t.hop > 0  -- exclude the seed entity
  order by t.hop, t.confidence desc;
end;
$$;


-- 2c. Feature knowledge graph — all entities related to a feature
create or replace function get_feature_knowledge_graph(
  p_user_id    uuid,
  p_feature_id uuid
)
returns table (
  entity_type  text,
  entity_id    uuid,
  relation     text,
  direction    text,
  confidence   float,
  title        text,
  preview      text
)
language sql stable
as $$
  -- Direct relations from entity_relations
  select
    n.related_type as entity_type,
    n.related_id   as entity_id,
    n.relation,
    n.direction,
    n.confidence,
    -- Resolve title based on type
    case n.related_type
      when 'memory' then (select m.title from memories m where m.id = n.related_id)
      when 'context_entry' then (select left(ce.content, 80) from context_entries ce where ce.id = n.related_id)
      when 'conversation' then (select left(cv.content, 80) from conversation_entries cv where cv.id = n.related_id)
      when 'plan' then (select p.title from plans p where p.id = n.related_id)
      else null
    end as title,
    case n.related_type
      when 'memory' then (select left(m.content, 200) from memories m where m.id = n.related_id)
      when 'context_entry' then (select left(ce.content, 200) from context_entries ce where ce.id = n.related_id)
      when 'conversation' then (select left(cv.content, 200) from conversation_entries cv where cv.id = n.related_id)
      else null
    end as preview
  from get_entity_neighborhood(p_user_id, 'feature', p_feature_id) n

  union all

  -- Context entries directly linked via FK
  select
    'context_entry'::text as entity_type,
    ce.id as entity_id,
    'belongs_to'::text as relation,
    'incoming'::text as direction,
    1.0::float as confidence,
    left(ce.content, 80) as title,
    left(ce.content, 200) as preview
  from context_entries ce
  where ce.feature_id = p_feature_id

  union all

  -- Memories linked via FK
  select
    'memory'::text as entity_type,
    m.id as entity_id,
    'scoped_to'::text as relation,
    'incoming'::text as direction,
    1.0::float as confidence,
    m.title,
    left(m.content, 200) as preview
  from memories m
  where m.feature_id = p_feature_id

  union all

  -- Conversations linked via FK
  select
    'conversation'::text as entity_type,
    cv.id as entity_id,
    'discusses'::text as relation,
    'incoming'::text as direction,
    1.0::float as confidence,
    left(cv.content, 80) as title,
    left(cv.content, 200) as preview
  from conversation_entries cv
  where cv.feature_id = p_feature_id;
$$;
