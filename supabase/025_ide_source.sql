-- Add ide_source column to track which IDE the conversation was imported from
ALTER TABLE conversation_entries
  ADD COLUMN IF NOT EXISTS ide_source text;

-- Index for filtering by IDE source
CREATE INDEX IF NOT EXISTS idx_conversation_entries_ide_source
  ON conversation_entries (ide_source)
  WHERE ide_source IS NOT NULL;

COMMENT ON COLUMN conversation_entries.ide_source IS
  'IDE that produced this conversation: cursor, claude-code, vscode, windsurf, intellij, pycharm, android-studio, visual-studio, zed, sublime-text';
