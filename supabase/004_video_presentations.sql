-- Video presentations table for Veo 3 generated project walkthroughs
create table if not exists public.video_presentations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  style text not null check (style in ('slideshow', 'pitch', 'code-tour')),
  status text not null default 'queued' check (status in ('queued', 'generating', 'done', 'failed')),
  prompt_context jsonb,
  segments jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Indexes for fast lookup
create index idx_video_presentations_project on public.video_presentations(project_id, status);
create index idx_video_presentations_user on public.video_presentations(user_id);

-- RLS
alter table public.video_presentations enable row level security;

create policy "Users can view own video presentations"
  on public.video_presentations for select
  using (auth.uid() = user_id);

create policy "Users can insert own video presentations"
  on public.video_presentations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own video presentations"
  on public.video_presentations for update
  using (auth.uid() = user_id);

-- Storage bucket for video clips
insert into storage.buckets (id, name, public)
values ('project-videos', 'project-videos', true)
on conflict (id) do nothing;

-- Storage policy: authenticated users can upload
create policy "Authenticated users can upload videos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'project-videos');

-- Storage policy: public read
create policy "Public video read access"
  on storage.objects for select
  to public
  using (bucket_id = 'project-videos');

-- Service role can manage all video objects
create policy "Service role manages videos"
  on storage.objects for all
  to service_role
  using (bucket_id = 'project-videos');
