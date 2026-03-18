-- MCP tools version tracking for listChanged notifications
-- Enables serverless-safe tool change notifications (piggybacked on POST responses)

ALTER TABLE users ADD COLUMN IF NOT EXISTS mcp_tools_version integer NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_tools_version integer NOT NULL DEFAULT 0;
