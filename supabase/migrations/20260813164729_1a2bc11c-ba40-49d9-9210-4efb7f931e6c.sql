
alter table public.security_scan_runs
  add column if not exists trigger text not null default 'manual',
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists finished_at timestamptz,
  add column if not exists commit_ref text,
  add column if not exists totals jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid;

notify pgrst, 'reload schema';
