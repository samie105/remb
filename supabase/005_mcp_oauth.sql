-- OAuth authorization codes for MCP clients (IDEs, tools)
-- Supports OAuth 2.1 + PKCE (RFC 7636, RFC 9728)
CREATE TABLE mcp_oauth_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash       text NOT NULL UNIQUE,          -- SHA-256 hash of the authorization code
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id       text NOT NULL,                  -- client_id from dynamic registration or static
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,                  -- PKCE challenge (S256)
  code_challenge_method text NOT NULL DEFAULT 'S256',
  scope           text,
  state           text,                           -- opaque state from the client
  expires_at      timestamptz NOT NULL,
  used            boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_mcp_oauth_codes_hash ON mcp_oauth_codes(code_hash);
CREATE INDEX idx_mcp_oauth_codes_expires ON mcp_oauth_codes(expires_at);

-- Dynamic client registrations (RFC 7591)
CREATE TABLE mcp_oauth_clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL UNIQUE,
  client_name     text,
  redirect_uris   text[] NOT NULL DEFAULT '{}',
  grant_types     text[] NOT NULL DEFAULT '{authorization_code}',
  response_types  text[] NOT NULL DEFAULT '{code}',
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_mcp_oauth_clients_client_id ON mcp_oauth_clients(client_id);

-- Auto-clean expired codes (run periodically or let them age out)
-- Codes are only valid for 5 minutes
