create table if not exists public.academic_email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  domain text not null,
  code_hash text not null,
  attempts integer not null default 0,
  resend_count integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant all on public.academic_email_verifications to service_role;

alter table public.academic_email_verifications enable row level security;

create policy "Service role manages academic verifications"
  on public.academic_email_verifications for all
  to service_role
  using (true) with check (true);

create index if not exists idx_aev_user on public.academic_email_verifications(user_id, created_at desc);
create unique index if not exists idx_aev_email_claimed
  on public.academic_email_verifications(lower(email))
  where consumed_at is not null;

create or replace function public.academic_domain_status(_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  addr text := lower(trim(coalesce(_email, '')));
  dom text;
  inst record;
begin
  if addr !~ '^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    return jsonb_build_object('valid', false, 'recognized', false, 'reason', 'invalid_email');
  end if;

  dom := split_part(addr, '@', 2);

  select id, name, website into inst
    from public.verification_institutions
   where status = 'approved'
     and (lower(email_domain) = dom or dom like '%.' || lower(email_domain))
   order by length(email_domain) desc
   limit 1;

  if inst.id is not null then
    return jsonb_build_object('valid', true, 'recognized', true, 'domain', dom,
                              'source', 'institution', 'institution', inst.name);
  end if;

  if dom ~ '\.edu$' or dom ~ '\.edu\.[a-z]{2,}$' or dom ~ '\.ac\.[a-z]{2,}$'
     or dom ~ '\.ac$' or dom ~ '\.org$' then
    return jsonb_build_object('valid', true, 'recognized', true, 'domain', dom, 'source', 'pattern');
  end if;

  return jsonb_build_object('valid', true, 'recognized', false, 'domain', dom,
                            'reason', 'unrecognized_domain');
end $$;

revoke all on function public.academic_domain_status(text) from public;
grant execute on function public.academic_domain_status(text) to authenticated, service_role;