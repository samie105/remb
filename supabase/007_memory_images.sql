-- Image context: store images attached to memories with OCR-extracted text
-- Uses Supabase Storage bucket "memory-images" for actual files

create table if not exists memory_images (
  id          uuid primary key default gen_random_uuid(),
  memory_id   uuid not null references memories(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  storage_path text not null,              -- path in Supabase Storage bucket
  filename     text not null,              -- original filename
  mime_type    text not null,              -- image/png, image/jpeg, etc.
  size_bytes   integer not null default 0,
  ocr_text     text,                       -- extracted text from OCR/vision
  description  text,                       -- AI-generated image description
  width        integer,
  height       integer,
  created_at   timestamptz not null default now()
);

create index if not exists memory_images_memory_id_idx on memory_images(memory_id);
create index if not exists memory_images_user_id_idx on memory_images(user_id);

-- Storage bucket (run via Supabase dashboard or storage API):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('memory-images', 'memory-images', false);
--
-- RLS policies are handled via the admin client (service role key),
-- so no row-level policies needed on the bucket for server-side operations.
