-- Store the GitHub webhook ID so we can delete it when scan_on_push is disabled
alter table projects add column if not exists github_webhook_id bigint;
