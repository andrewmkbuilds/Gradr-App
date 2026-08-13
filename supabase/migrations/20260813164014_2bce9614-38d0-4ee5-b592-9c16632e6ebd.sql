
create table if not exists public.security_scan_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'internal_scanner',
  trigger text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  commit_sha text,
  commit_ref text,
  commit_url text,
  totals jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.security_scan_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.security_scan_runs(id) on delete cascade,
  internal_id text not null,
  scanner_name text not null default 'gradr_internal',
  level text not null default 'warning',
  title text not null,
  description text,
  entity text,
  metadata jsonb not null default '{}'::jsonb,
  fingerprint text,
  created_at timestamptz not null default now(),
  unique (run_id, internal_id)
);
create index if not exists idx_ssf_run on public.security_scan_findings(run_id);
create index if not exists idx_ssf_internal on public.security_scan_findings(internal_id);

create table if not exists public.security_finding_issues (
  id uuid primary key default gen_random_uuid(),
  internal_id text not null,
  run_id uuid references public.security_scan_runs(id) on delete set null,
  repo text not null,
  issue_number integer not null,
  issue_url text not null,
  commit_sha text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (repo, internal_id)
);

create table if not exists public.security_export_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  admin_id uuid not null,
  format text not null,
  run_id uuid,
  internal_ids text[] not null default '{}',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_csrf_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  admin_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

grant select on public.security_scan_runs to authenticated;
grant select on public.security_scan_findings to authenticated;
grant select on public.security_finding_issues to authenticated;
grant all on public.security_scan_runs to service_role;
grant all on public.security_scan_findings to service_role;
grant all on public.security_finding_issues to service_role;
grant all on public.security_export_tokens to service_role;
grant all on public.admin_csrf_tokens to service_role;

alter table public.security_scan_runs enable row level security;
alter table public.security_scan_findings enable row level security;
alter table public.security_finding_issues enable row level security;
alter table public.security_export_tokens enable row level security;
alter table public.admin_csrf_tokens enable row level security;

create policy "Admins read scan runs" on public.security_scan_runs
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') and (auth.jwt() ->> 'is_anonymous')::boolean is not true);

create policy "Admins read scan findings" on public.security_scan_findings
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') and (auth.jwt() ->> 'is_anonymous')::boolean is not true);

create policy "Admins read finding issues" on public.security_finding_issues
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') and (auth.jwt() ->> 'is_anonymous')::boolean is not true);
