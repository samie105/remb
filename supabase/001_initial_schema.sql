-- Remb — Initial Schema
-- Run this in Supabase → SQL Editor in order.

-- ─── Users ───────────────────────────────────────────────────────────────────
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  github_login   text unique not null,
  github_avatar  text,
  name           text,
  email          text,
  plan           text not null default 'free', -- free | pro | team
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ─── Projects ─────────────────────────────────────────────────────────────────
create table if not exists projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  name         text not null,
  slug         text not null,
  description  text,
  repo_url     text,
  repo_name    text,   -- "owner/repo"
  language     text,
  branch       text default 'main',
  status       text not null default 'active', -- active | paused | scanning
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(user_id, slug)
);

-- ─── Features ─────────────────────────────────────────────────────────────────
create table if not exists features (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  description  text,
  status       text default 'active', -- active | archived
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─── Context Entries ──────────────────────────────────────────────────────────
create table if not exists context_entries (
  id           uuid primary key default gen_random_uuid(),
  feature_id   uuid not null references features(id) on delete cascade,
  content      text not null,
  entry_type   text default 'manual',  -- manual | scan | decision | fix
  source       text default 'web',     -- cli | ide | worker | web
  metadata     jsonb default '{}',
  created_at   timestamptz default now()
);

-- ─── Feature Links ────────────────────────────────────────────────────────────
create table if not exists feature_links (
  id                  uuid primary key default gen_random_uuid(),
  feature_id          uuid not null references features(id) on delete cascade,
  related_feature_id  uuid not null references features(id) on delete cascade,
  relationship        text default 'related', -- related | depends_on | extends
  created_at          timestamptz default now(),
  unique(feature_id, related_feature_id)
);

-- ─── API Keys ─────────────────────────────────────────────────────────────────
create table if not exists api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  name         text not null,
  key_hash     text unique not null,
  key_preview  text not null,    -- last 4 chars shown in UI
  last_used_at timestamptz,
  created_at   timestamptz default now()
);

-- ─── Scan Jobs ────────────────────────────────────────────────────────────────
create table if not exists scan_jobs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  status       text default 'queued',   -- queued | running | done | failed
  triggered_by text default 'manual',   -- cli | webhook | manual
  result       jsonb default '{}',
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz default now()
);

-- ─── Updated-at trigger ───────────────────────────────────────────────────────
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger users_updated_at
  before update on users
  for each row execute function handle_updated_at();

create or replace trigger projects_updated_at
  before update on projects
  for each row execute function handle_updated_at();

create or replace trigger features_updated_at
  before update on features
  for each row execute function handle_updated_at();
