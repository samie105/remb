-- Remb — Migration 003: CLI OAuth login sessions
-- Tracks pending browser-based logins initiated from the CLI.
-- After the user completes GitHub OAuth, an API key is generated and stored here
-- for the CLI to poll and retrieve.

create table if not exists cli_auth_sessions (
  id          uuid primary key default gen_random_uuid(),
  state       text unique not null,                       -- random token the CLI uses to poll
  status      text not null default 'pending',            -- pending | completed | expired
  api_key     text,                                       -- plaintext key, returned once to CLI then cleared
  user_id     uuid references users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);

-- Auto-expire old sessions (can be cleaned by a cron or on poll)
create index if not exists idx_cli_auth_sessions_state on cli_auth_sessions(state);
create index if not exists idx_cli_auth_sessions_expires on cli_auth_sessions(expires_at);
