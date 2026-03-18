-- 013: File dependency tracking for real import/require graph
-- Stores actual code-level import relationships between files

CREATE TABLE IF NOT EXISTS file_dependencies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_path text NOT NULL,      -- file that contains the import statement
  target_path text NOT NULL,      -- file being imported
  import_type text NOT NULL DEFAULT 'static',  -- static | dynamic | re-export | side-effect
  imported_symbols text[],        -- symbols imported (e.g. ['Button', 'Input'])
  scan_job_id uuid REFERENCES scan_jobs(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),

  UNIQUE(project_id, source_path, target_path)
);

-- Fast lookups by project
CREATE INDEX idx_file_deps_project ON file_dependencies(project_id);

-- Find what a file imports
CREATE INDEX idx_file_deps_source ON file_dependencies(project_id, source_path);

-- Find what imports a file (reverse lookup — "who uses this?")
CREATE INDEX idx_file_deps_target ON file_dependencies(project_id, target_path);
