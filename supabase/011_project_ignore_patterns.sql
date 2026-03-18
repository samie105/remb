-- Add ignore_patterns column to projects table.
-- Stores a newline-separated list of glob/path prefixes to exclude from scanning
-- (e.g. "__tests__\nstories\n*.generated.ts").
-- Users can also place a .rembignore file in their repo root for the same effect.

alter table projects
  add column if not exists ignore_patterns text default null;

comment on column projects.ignore_patterns is
  'Newline-separated path prefixes/globs to exclude from Remb scans. '
  'Equivalent to .rembignore in the repo root.';
