-- Chat prompt usage tracking per user per model
-- Each user gets 4 prompts for o4-mini and 4 for gpt-4.1 per day

create table if not exists chat_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  model       text not null check (model in ('o4-mini', 'gpt-4.1')),
  used_at     timestamptz not null default now()
);

create index idx_chat_usage_user_model_date
  on chat_usage (user_id, model, used_at desc);

-- RLS
alter table chat_usage enable row level security;

create policy "Users can read own chat usage"
  on chat_usage for select using (auth.uid() = user_id);

create policy "Users can insert own chat usage"
  on chat_usage for insert with check (auth.uid() = user_id);

-- Helper: count prompts used today for a given model
create or replace function get_chat_usage_today(
  p_user_id uuid,
  p_model   text
) returns int as $$
  select count(*)::int
  from chat_usage
  where user_id = p_user_id
    and model   = p_model
    and used_at >= date_trunc('day', now() at time zone 'UTC');
$$ language sql stable security definer;

-- Helper: get all model usage for today
create or replace function get_all_chat_usage_today(
  p_user_id uuid
) returns table(model text, count bigint) as $$
  select cu.model, count(*)
  from chat_usage cu
  where cu.user_id = p_user_id
    and cu.used_at >= date_trunc('day', now() at time zone 'UTC')
  group by cu.model;
$$ language sql stable security definer;
