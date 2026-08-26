# Admin RPC security contract

Every database routine named `public.admin_*` is part of the admin control
plane. The rules below are mandatory — a migration that breaks one of them is a
privilege bug, not a style issue. CI enforces them
(`bun run test:admin-rpc`, `bun run test:admin-rls`).

## 1. SECURITY DEFINER + fixed search path

```sql
CREATE OR REPLACE FUNCTION public.admin_something(_arg uuid)
RETURNS TABLE (...)
LANGUAGE plpgsql
VOLATILE                      -- required: the guard writes an audit row
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_rpc_guard('admin_something');   -- always first statement
  ...
END;
$$;
```

- `SECURITY DEFINER` — the routine reads tables that RLS hides from the caller.
- `SET search_path = public` — never omit; without it a definer function is
  hijackable through a caller-controlled search path.
- `VOLATILE` — a `STABLE`/`IMMUTABLE` function cannot insert the audit row.
- Language must be `plpgsql`. Plain SQL routines cannot call the guard, so
  convert them (this is why `admin_audit_actors()` is plpgsql).

## 2. Internal admin check — never client-side

`public.admin_rpc_guard(_function_name text, _limit int default 120,
_window interval default '1 minute')` is the single gate. It:

1. resolves `auth.uid()`; rejects anonymous callers,
2. verifies `public.has_role(auth.uid(), 'admin')`,
3. counts the caller's successful calls to that function inside the window and
   raises when the limit is exceeded (throttling — stops brute force and
   runaway UI polling),
4. writes one `public.admin_rpc_audit` row for every outcome
   (`ok` / `denied` / `rate_limited`) with actor, function name, request id
   (`x-request-id`, `x-client-request-id`, `cf-ray`, else a generated uuid),
   client IP (first `x-forwarded-for` hop) and user agent.

Never gate an admin routine on a value the client supplies (a role in the JWT
payload body, a flag in the request, a table the user can write). Never rely on
the UI hiding a route. Never store roles anywhere but `public.user_roles`.

Custom limits: pass a second argument, e.g.
`PERFORM public.admin_rpc_guard('admin_export_x', 10);` for expensive exports.

## 3. GRANT / REVOKE rules

Every admin routine ends its migration with exactly:

```sql
REVOKE ALL ON FUNCTION public.admin_something(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_something(uuid) TO authenticated, service_role;
```

- `authenticated` **must** have EXECUTE. Without it PostgREST returns
  `42501 permission denied for function ...` to real admins — the grant drift
  that has broken the admin dashboards before. The role check inside the
  function is what makes this safe.
- `anon` and `PUBLIC` must never hold EXECUTE.
- `service_role` keeps EXECUTE for edge functions and cron jobs.

## 4. Table-level rules

`public.admin_rpc_audit` (and `public.admin_audit_log`) are append-only from the
database's point of view:

- RLS enabled; the only policy is an admin `SELECT` using
  `public.has_role(auth.uid(), 'admin')`.
- No `INSERT`/`UPDATE`/`DELETE` policy exists — rows are written solely by the
  SECURITY DEFINER guard.
- Grants: `GRANT SELECT ... TO authenticated; GRANT ALL ... TO service_role;`
  never `anon`.

## 5. Checklist for a new admin routine

- [ ] named `admin_*`
- [ ] `plpgsql`, `VOLATILE`, `SECURITY DEFINER`, `SET search_path = public`
- [ ] first statement is `PERFORM public.admin_rpc_guard('<exact name>')`
- [ ] `REVOKE ALL ... FROM PUBLIC, anon`
- [ ] `GRANT EXECUTE ... TO authenticated, service_role`
- [ ] added to `READ_RPCS` or `WRITE_RPCS` in `scripts/admin-rpc-guard.mjs`
- [ ] any new table added to `ADMIN_TABLES` in `scripts/admin-rls-matrix.mjs`

## 6. Automated enforcement

| Check | Command | What it proves |
|---|---|---|
| Grant drift | `bun run test:admin-rpc` | admin gets 2xx, non-admin and anon are refused, no `42501` |
| RLS matrix | `bun run test:admin-rls` | admin/non-admin JWT select+write behaviour on admin tables |
| Admin UI | `bun run test:admin-routes` | Playwright signs in as admin, every admin route renders its data table without a permission error |

All three run in `.github/workflows/security-baseline.yml` and skip cleanly when
the `ADMIN_E2E_*` credentials are not configured.
