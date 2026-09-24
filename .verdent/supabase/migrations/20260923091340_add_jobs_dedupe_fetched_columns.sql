alter table jobs add column if not exists dedupe_key text;
alter table jobs add column if not exists source_refs jsonb not null default '[]'::jsonb;
alter table jobs add column if not exists fetched_at timestamptz;
create index if not exists jobs_dedupe_key_idx on jobs (dedupe_key);