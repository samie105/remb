-- MCP Hub: store user-registered MCP servers for aggregation

CREATE TABLE mcp_servers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  transport   TEXT NOT NULL DEFAULT 'streamable-http'
                CHECK (transport IN ('sse', 'streamable-http')),
  auth_type   TEXT NOT NULL DEFAULT 'none'
                CHECK (auth_type IN ('none', 'bearer', 'custom-header')),
  auth_token  TEXT,                       -- bearer token (stored encrypted at rest by Supabase)
  custom_headers JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  tools_count INTEGER NOT NULL DEFAULT 0,
  last_health_check TIMESTAMPTZ,
  health_status TEXT NOT NULL DEFAULT 'unknown'
                CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TRIGGER set_mcp_servers_updated_at
  BEFORE UPDATE ON mcp_servers
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE INDEX idx_mcp_servers_user    ON mcp_servers(user_id);
CREATE INDEX idx_mcp_servers_active  ON mcp_servers(user_id) WHERE is_active;
