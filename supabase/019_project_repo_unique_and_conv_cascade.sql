-- 019: Prevent duplicate repo linkage & fix conversation orphans
--
-- 1. Partial unique index: one project per repo per user
-- 2. Change conversation_entries FK from SET NULL to CASCADE

-- Prevent the same user from linking the same GitHub repo to multiple projects
create unique index if not exists idx_projects_user_repo_unique
  on projects (user_id, repo_name)
  where repo_name is not null;

-- Fix orphaned conversation entries on project deletion:
-- Drop the old FK and recreate with CASCADE
alter table conversation_entries
  drop constraint if exists conversation_entries_project_id_fkey;

alter table conversation_entries
  add constraint conversation_entries_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;
