
create or replace function public.security_scan_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with rls_off as (
    select 'rls_disabled:' || c.relname as internal_id,
           'error'::text as level,
           'Row level security disabled'::text as title,
           'Table public.' || c.relname || ' is exposed through the API but has RLS disabled.' as description,
           'public.' || c.relname as entity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  no_policy as (
    select 'rls_no_policy:' || c.relname,
           'warning',
           'RLS enabled with no policies',
           'Table public.' || c.relname || ' has RLS enabled but no policies at all.',
           'public.' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  ),
  open_policy as (
    select 'policy_always_true:' || c.relname || ':' || p.polname,
           'error',
           'Policy always evaluates to true',
           'Policy "' || p.polname || '" on public.' || c.relname || ' has no restricting condition.',
           'public.' || c.relname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true') = 'true'
      and p.polcmd in ('r', '*')
  ),
  anon_definer as (
    select 'anon_definer_function:' || p.proname,
           'error',
           'SECURITY DEFINER function executable by anonymous role',
           'Function public.' || p.proname || ' runs with owner privileges and is executable by the anon role.',
           'public.' || p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  anon_tables as (
    select distinct 'anon_table_grant:' || t.table_name,
           'info',
           'Anonymous role has table privileges',
           'Table public.' || t.table_name || ' grants privileges to the anon role.',
           'public.' || t.table_name
    from information_schema.role_table_grants t
    where t.table_schema = 'public' and t.grantee = 'anon'
  ),
  all_findings as (
    select * from rls_off
    union all select * from no_policy
    union all select * from open_policy
    union all select * from anon_definer
    union all select * from anon_tables
  )
  select coalesce(jsonb_agg(to_jsonb(f) order by f.level, f.internal_id), '[]'::jsonb)
  from all_findings f;
$$;

revoke all on function public.security_scan_snapshot() from public, anon, authenticated;
grant execute on function public.security_scan_snapshot() to service_role;
