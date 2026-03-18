-- Two-factor authentication: passkeys (WebAuthn) and TOTP

-- Master 2FA toggle on users
alter table users add column if not exists two_factor_enabled boolean not null default false;

-- WebAuthn passkeys
create table if not exists user_passkeys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  credential_id   text unique not null,   -- base64url-encoded credential ID
  public_key      text not null,           -- base64url-encoded public key
  counter         bigint not null default 0,
  transports      text[] default '{}',
  device_name     text not null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz
);

create index if not exists user_passkeys_user_id_idx on user_passkeys(user_id);
create index if not exists user_passkeys_credential_id_idx on user_passkeys(credential_id);

-- TOTP authenticator (one per user)
create table if not exists user_totp_secrets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique not null references users(id) on delete cascade,
  secret          text not null,           -- base32-encoded TOTP secret
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);
