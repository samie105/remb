-- 021: Track embedding model per row for mixed-model coexistence during migration.
-- Allows queries to filter by model and supports incremental re-embedding.

alter table memories
  add column if not exists embedding_model text default 'text-embedding-3-small';

alter table context_entries
  add column if not exists embedding_model text default 'text-embedding-3-small';

alter table conversation_entries
  add column if not exists embedding_model text default 'text-embedding-3-small';

-- Partial indexes for rows still on the old model (re-embedding targets)
create index if not exists idx_memories_old_embedding
  on memories(id) where embedding is not null and embedding_model != 'text-embedding-3-small';

create index if not exists idx_context_entries_old_embedding
  on context_entries(id) where embedding is not null and embedding_model != 'text-embedding-3-small';

create index if not exists idx_conversation_entries_old_embedding
  on conversation_entries(id) where embedding is not null and embedding_model != 'text-embedding-3-small';
