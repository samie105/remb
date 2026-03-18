-- Add pending_segments counter for parallel video generation
alter table public.video_presentations
  add column if not exists pending_segments integer not null default 0;
