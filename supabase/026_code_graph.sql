-- 026: Code graph — granular code nodes, rich edges, and architectural layers
-- Enables function/class-level knowledge graph with 14 edge types across 5 categories.
-- Additive: existing features/context_entries/entity_relations are untouched.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. CODE NODES — every function, class, export, type, and file as a node
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists code_nodes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  scan_job_id uuid references scan_jobs(id) on delete set null,

  -- Identity
  node_type   text not null,  -- 'file' | 'function' | 'class' | 'method' | 'type' | 'export' | 'module' | 'hook' | 'component'
  name        text not null,
  file_path   text not null,
  file_sha    text,           -- blob SHA for smart-scan dedup

  -- Location
  line_start  int,
  line_end    int,

  -- Semantics
  summary     text not null default '',
  tags        text[] not null default '{}',
  complexity  text not null default 'simple',  -- 'simple' | 'moderate' | 'complex'
  layer       text,                             -- 'api' | 'service' | 'data' | 'ui' | 'middleware' | 'utility' | 'test' | 'config' | 'core'

  -- Structural metadata (params, return type, methods, properties, etc.)
  structure   jsonb not null default '{}',

  -- Embedding for semantic search
  embedding   vector(1536),

  -- Dedup
  content_hash text,  -- hash of the node's source content for change detection

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Prevent duplicate nodes for same symbol in same file
  unique(project_id, file_path, node_type, name)
);

-- Fast lookups
create index if not exists idx_code_nodes_project     on code_nodes(project_id);
create index if not exists idx_code_nodes_file_path   on code_nodes(project_id, file_path);
create index if not exists idx_code_nodes_type         on code_nodes(project_id, node_type);
create index if not exists idx_code_nodes_layer        on code_nodes(project_id, layer) where layer is not null;
create index if not exists idx_code_nodes_scan_job     on code_nodes(scan_job_id) where scan_job_id is not null;
create index if not exists idx_code_nodes_tags         on code_nodes using gin(tags);

-- Semantic search via pgvector (IVFFlat for scale)
create index if not exists idx_code_nodes_embedding
  on code_nodes using ivfflat (embedding vector_cosine_ops) with (lists = 100);


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. CODE EDGES — 14 relationship types across 5 categories
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists code_edges (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  scan_job_id     uuid references scan_jobs(id) on delete set null,

  -- Resolved FK references (populated by resolve_code_edges after scan)
  source_node_id  uuid references code_nodes(id) on delete cascade,
  target_node_id  uuid references code_nodes(id) on delete cascade,

  -- Name-based references (populated at scan time, always present)
  source_node_name text not null,
  source_file      text not null,
  target_node_name text not null,
  target_file      text not null,

  -- Relationship
  edge_type       text not null,
  edge_category   text not null default 'behavioral',
  -- Structural:  'contains' | 'imports' | 'exports' | 'inherits' | 'implements'
  -- Behavioral:  'calls' | 'subscribes' | 'publishes' | 'middleware'
  -- Data flow:   'reads' | 'writes' | 'transforms' | 'validates'
  -- Dependency:  'depends_on' | 'tested_by' | 'configures'

  direction       text not null default 'forward',  -- 'forward' | 'backward' | 'bidirectional'
  weight          float not null default 0.5,        -- 0.0 to 1.0
  description     text,
  metadata        jsonb not null default '{}',

  created_at      timestamptz not null default now(),

  -- Prevent duplicate edges (name-based since node_ids may be null initially)
  unique(project_id, source_file, source_node_name, target_file, target_node_name, edge_type)
);

-- Traversal indexes
create index if not exists idx_code_edges_source      on code_edges(project_id, source_node_id) where source_node_id is not null;
create index if not exists idx_code_edges_target      on code_edges(project_id, target_node_id) where target_node_id is not null;
create index if not exists idx_code_edges_source_name on code_edges(project_id, source_file, source_node_name);
create index if not exists idx_code_edges_target_name on code_edges(project_id, target_file, target_node_name);
create index if not exists idx_code_edges_type        on code_edges(project_id, edge_type);
create index if not exists idx_code_edges_scan_job    on code_edges(scan_job_id) where scan_job_id is not null;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. PROJECT LAYERS — architectural groupings per project (scan-time detected)
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists project_layers (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,

  name             text not null,           -- 'API Layer', 'UI Layer', etc.
  slug             text not null,           -- 'api', 'ui', etc.
  description      text not null default '',
  detection_method text not null default 'heuristic',  -- 'heuristic' | 'llm'
  file_patterns    text[] not null default '{}',       -- path prefixes that matched
  node_count       int not null default 0,

  metadata         jsonb not null default '{}',
  created_at       timestamptz not null default now(),

  unique(project_id, slug)
);

create index if not exists idx_project_layers_project on project_layers(project_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. GRAPH TRAVERSAL FUNCTIONS
-- ═════════════════════════════════════════════════════════════════════════════

-- 4a. Get 1-hop code neighbors of a node (works with resolved or name-based edges)
create or replace function get_code_neighbors(
  p_project_id  uuid,
  p_node_id     uuid
)
returns table (
  direction     text,
  node_id       uuid,
  node_type     text,
  node_name     text,
  file_path     text,
  summary       text,
  edge_type     text,
  weight        float
)
language sql stable
as $$
  -- Outgoing via resolved IDs
  select
    'outgoing'::text,
    cn.id, cn.node_type, cn.name, cn.file_path, cn.summary,
    ce.edge_type, ce.weight
  from code_edges ce
  join code_nodes cn on cn.id = ce.target_node_id
  where ce.project_id = p_project_id
    and ce.source_node_id = p_node_id

  union all

  -- Outgoing via name-based (unresolved)
  select
    'outgoing'::text,
    cn.id, cn.node_type, cn.name, cn.file_path, cn.summary,
    ce.edge_type, ce.weight
  from code_edges ce
  join code_nodes src on src.id = p_node_id
  join code_nodes cn on cn.project_id = ce.project_id
    and cn.file_path = ce.target_file
    and cn.name = ce.target_node_name
  where ce.project_id = p_project_id
    and ce.source_node_id is null
    and ce.source_file = src.file_path
    and ce.source_node_name = src.name

  union all

  -- Incoming via resolved IDs
  select
    'incoming'::text,
    cn.id, cn.node_type, cn.name, cn.file_path, cn.summary,
    ce.edge_type, ce.weight
  from code_edges ce
  join code_nodes cn on cn.id = ce.source_node_id
  where ce.project_id = p_project_id
    and ce.target_node_id = p_node_id

  union all

  -- Incoming via name-based (unresolved)
  select
    'incoming'::text,
    cn.id, cn.node_type, cn.name, cn.file_path, cn.summary,
    ce.edge_type, ce.weight
  from code_edges ce
  join code_nodes tgt on tgt.id = p_node_id
  join code_nodes cn on cn.project_id = ce.project_id
    and cn.file_path = ce.source_file
    and cn.name = ce.source_node_name
  where ce.project_id = p_project_id
    and ce.target_node_id is null
    and ce.target_file = tgt.file_path
    and ce.target_node_name = tgt.name;
$$;

-- 4b. Semantic search across code nodes
create or replace function search_code_nodes(
  p_project_id      uuid,
  p_query_embedding vector(1536),
  p_match_threshold float default 0.3,
  p_match_count     int default 20,
  p_node_types      text[] default null,
  p_layer           text default null
)
returns table (
  id          uuid,
  node_type   text,
  name        text,
  file_path   text,
  summary     text,
  tags        text[],
  complexity  text,
  layer       text,
  similarity  float
)
language sql stable
as $$
  select
    cn.id,
    cn.node_type,
    cn.name,
    cn.file_path,
    cn.summary,
    cn.tags,
    cn.complexity,
    cn.layer,
    1 - (cn.embedding <=> p_query_embedding) as similarity
  from code_nodes cn
  where cn.project_id = p_project_id
    and cn.embedding is not null
    and 1 - (cn.embedding <=> p_query_embedding) > p_match_threshold
    and (p_node_types is null or cn.node_type = any(p_node_types))
    and (p_layer is null or cn.layer = p_layer)
  order by cn.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- 4c. Multi-hop code graph traversal (max 3 hops)
create or replace function traverse_code_graph(
  p_project_id  uuid,
  p_start_id    uuid,
  p_max_hops    int default 2,
  p_edge_types  text[] default null
)
returns table (
  hop         int,
  node_id     uuid,
  node_type   text,
  node_name   text,
  file_path   text,
  summary     text,
  layer       text,
  via_edge    text,
  weight      float,
  path        uuid[]
)
language plpgsql stable
as $$
begin
  return query
  with recursive traversal as (
    select
      0 as hop,
      p_start_id as node_id,
      cn.node_type,
      cn.name as node_name,
      cn.file_path,
      cn.summary,
      cn.layer,
      ''::text as via_edge,
      1.0::float as weight,
      array[p_start_id] as path
    from code_nodes cn
    where cn.id = p_start_id and cn.project_id = p_project_id

    union all

    select
      t.hop + 1,
      nb.node_id,
      nb.node_type,
      nb.node_name,
      nb.file_path,
      nb.summary,
      nb.layer,
      nb.edge_type,
      t.weight * nb.weight,
      t.path || nb.node_id
    from traversal t
    cross join lateral (
      -- Outgoing
      select cn.id as node_id, cn.node_type, cn.name as node_name,
             cn.file_path, cn.summary, cn.layer,
             ce.edge_type, ce.weight
      from code_edges ce
      join code_nodes cn on cn.id = ce.target_node_id
      where ce.project_id = p_project_id
        and ce.source_node_id = t.node_id
        and (p_edge_types is null or ce.edge_type = any(p_edge_types))

      union all

      -- Incoming
      select cn.id, cn.node_type, cn.name,
             cn.file_path, cn.summary, cn.layer,
             ce.edge_type, ce.weight
      from code_edges ce
      join code_nodes cn on cn.id = ce.source_node_id
      where ce.project_id = p_project_id
        and ce.target_node_id = t.node_id
        and (p_edge_types is null or ce.edge_type = any(p_edge_types))
    ) nb
    where t.hop < least(p_max_hops, 3)
      and not nb.node_id = any(t.path)
  )
  select t.hop, t.node_id, t.node_type, t.node_name,
         t.file_path, t.summary, t.layer, t.via_edge, t.weight, t.path
  from traversal t
  where t.hop > 0
  order by t.hop, t.weight desc;
end;
$$;

-- 4d. Get project layer summary with node counts
create or replace function get_project_layer_summary(
  p_project_id uuid
)
returns table (
  layer_name  text,
  slug        text,
  description text,
  node_count  bigint,
  file_count  bigint
)
language sql stable
as $$
  select
    pl.name as layer_name,
    pl.slug,
    pl.description,
    count(distinct cn.id) as node_count,
    count(distinct cn.file_path) as file_count
  from project_layers pl
  left join code_nodes cn on cn.project_id = pl.project_id and cn.layer = pl.slug
  where pl.project_id = p_project_id
  group by pl.id, pl.name, pl.slug, pl.description
  order by node_count desc;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. EDGE RESOLUTION — resolve name-based edges to node UUIDs after scan
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function resolve_code_edges(p_project_id uuid)
returns int
language plpgsql
as $$
declare
  resolved_count int := 0;
begin
  -- Resolve source_node_id
  update code_edges ce
  set source_node_id = cn.id
  from code_nodes cn
  where ce.project_id = p_project_id
    and ce.source_node_id is null
    and cn.project_id = ce.project_id
    and cn.file_path = ce.source_file
    and cn.name = ce.source_node_name;

  -- Resolve target_node_id
  update code_edges ce
  set target_node_id = cn.id
  from code_nodes cn
  where ce.project_id = p_project_id
    and ce.target_node_id is null
    and cn.project_id = ce.project_id
    and cn.file_path = ce.target_file
    and cn.name = ce.target_node_name;

  get diagnostics resolved_count = row_count;
  return resolved_count;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. GRAPH VALIDATION — quality checks inspired by UA's graph-reviewer
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function validate_code_graph(p_project_id uuid)
returns jsonb
language plpgsql stable
as $$
declare
  result jsonb;
  total_nodes int;
  total_edges int;
  total_layers int;
  orphan_nodes int;
  unresolved_edges int;
  self_edges int;
  empty_summaries int;
begin
  select count(*) into total_nodes from code_nodes where project_id = p_project_id;
  select count(*) into total_edges from code_edges where project_id = p_project_id;
  select count(*) into total_layers from project_layers where project_id = p_project_id;

  -- Orphan nodes: nodes with no edges at all
  select count(*) into orphan_nodes
  from code_nodes cn
  where cn.project_id = p_project_id
    and cn.node_type != 'file'
    and not exists (
      select 1 from code_edges ce
      where ce.project_id = p_project_id
        and (ce.source_node_id = cn.id or ce.target_node_id = cn.id
          or (ce.source_file = cn.file_path and ce.source_node_name = cn.name)
          or (ce.target_file = cn.file_path and ce.target_node_name = cn.name))
    );

  -- Unresolved edges
  select count(*) into unresolved_edges
  from code_edges
  where project_id = p_project_id
    and (source_node_id is null or target_node_id is null);

  -- Self-referencing edges
  select count(*) into self_edges
  from code_edges
  where project_id = p_project_id
    and source_node_name = target_node_name
    and source_file = target_file;

  -- Empty summaries
  select count(*) into empty_summaries
  from code_nodes
  where project_id = p_project_id
    and (summary is null or summary = '');

  result := jsonb_build_object(
    'total_nodes', total_nodes,
    'total_edges', total_edges,
    'total_layers', total_layers,
    'orphan_nodes', orphan_nodes,
    'unresolved_edges', unresolved_edges,
    'self_edges', self_edges,
    'empty_summaries', empty_summaries,
    'decision', case
      when total_nodes = 0 then 'REJECTED'
      when empty_summaries > total_nodes * 0.5 then 'WARN'
      when self_edges > 5 then 'WARN'
      else 'APPROVED'
    end
  );

  return result;
end;
$$;
