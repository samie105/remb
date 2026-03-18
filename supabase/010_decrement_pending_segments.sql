-- Atomic decrement for pending_segments counter used by parallel video generation.
-- Returns the new value after decrementing.
create or replace function public.decrement_pending_segments(p_id uuid)
returns integer
language sql
as $$
  update public.video_presentations
  set pending_segments = pending_segments - 1
  where id = p_id
  returning pending_segments;
$$;
