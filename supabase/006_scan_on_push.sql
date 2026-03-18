-- Add scan_on_push setting to projects table
alter table projects add column if not exists scan_on_push boolean default false;

-- Add webhook_secret for verifying GitHub webhook payloads
alter table projects add column if not exists webhook_secret text;
