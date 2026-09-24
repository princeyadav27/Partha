-- Gorkha MVP slice schema (no auth in phase 1; single shared workspace)
create extension if not exists "pgcrypto";

create table if not exists resumes (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  file_type text,
  extracted_text text not null default '',
  analysis_status text not null default 'uploaded',
  file_data bytea,
  created_at timestamptz not null default now()
);

create table if not exists candidate_profile (
  id uuid primary key default gen_random_uuid(),
  profile jsonb not null default '{}'::jsonb,
  summary text,
  experience_level text,
  target_roles jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  remote_preference text default 'any',
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_job_id text not null,
  title text not null,
  company text,
  description text not null default '',
  location text,
  country text,
  remote_status text default 'onsite',
  employment_type text,
  posted_at timestamptz,
  source_url text,
  created_at timestamptz not null default now(),
  unique (source, source_job_id)
);

create table if not exists job_requirements (
  job_id uuid primary key references jobs(id) on delete cascade,
  requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists job_matches (
  job_id uuid primary key references jobs(id) on delete cascade,
  match jsonb not null default '{}'::jsonb,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists saved_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(id) on delete cascade,
  status text not null default 'saved',
  notes text,
  applied_at timestamptz,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists application_events (
  id uuid primary key default gen_random_uuid(),
  saved_job_id uuid not null references saved_jobs(id) on delete cascade,
  event_type text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- RLS: no-auth MVP; all app data flows through the server API.
alter table resumes enable row level security;
alter table candidate_profile enable row level security;
alter table jobs enable row level security;
alter table job_requirements enable row level security;
alter table job_matches enable row level security;
alter table saved_jobs enable row level security;
alter table application_events enable row level security;

drop policy if exists "mvp anon full resumes" on resumes;
create policy "mvp anon full resumes" on resumes for all to anon using (true) with check (true);
drop policy if exists "mvp anon full candidate_profile" on candidate_profile;
create policy "mvp anon full candidate_profile" on candidate_profile for all to anon using (true) with check (true);
drop policy if exists "mvp anon full jobs" on jobs;
create policy "mvp anon full jobs" on jobs for all to anon using (true) with check (true);
drop policy if exists "mvp anon full job_requirements" on job_requirements;
create policy "mvp anon full job_requirements" on job_requirements for all to anon using (true) with check (true);
drop policy if exists "mvp anon full job_matches" on job_matches;
create policy "mvp anon full job_matches" on job_matches for all to anon using (true) with check (true);
drop policy if exists "mvp anon full saved_jobs" on saved_jobs;
create policy "mvp anon full saved_jobs" on saved_jobs for all to anon using (true) with check (true);
drop policy if exists "mvp anon full application_events" on application_events;
create policy "mvp anon full application_events" on application_events for all to anon using (true) with check (true);

grant usage on schema public to anon;
grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;