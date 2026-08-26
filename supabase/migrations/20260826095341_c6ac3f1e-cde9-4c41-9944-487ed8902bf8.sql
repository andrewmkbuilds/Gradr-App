-- 1. Audit trail for every admin RPC invocation ------------------------------
CREATE TABLE IF NOT EXISTS public.admin_rpc_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  function_name text NOT NULL,
  request_id text,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','denied','rate_limited')),
  ip text,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_rpc_audit TO authenticated;
GRANT ALL ON public.admin_rpc_audit TO service_role;

ALTER TABLE public.admin_rpc_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read admin rpc audit" ON public.admin_rpc_audit;
CREATE POLICY "Admins read admin rpc audit"
ON public.admin_rpc_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_admin_rpc_audit_created_at ON public.admin_rpc_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_rpc_audit_actor ON public.admin_rpc_audit (actor_id, function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_rpc_audit_status ON public.admin_rpc_audit (status, created_at DESC);

-- 2. Shared guard: admin check + throttle + audit ----------------------------
CREATE OR REPLACE FUNCTION public.admin_rpc_guard(
  _function text,
  _limit integer DEFAULT 120,
  _window interval DEFAULT interval '1 minute'
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  actor uuid := auth.uid();
  hdrs jsonb := '{}'::jsonb;
  rid text;
  ua text;
  ip text;
  recent integer;
BEGIN
  BEGIN
    hdrs := COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  EXCEPTION WHEN others THEN
    hdrs := '{}'::jsonb;
  END;

  rid := COALESCE(hdrs->>'x-request-id', hdrs->>'x-client-request-id', hdrs->>'cf-ray', gen_random_uuid()::text);
  ua  := NULLIF(left(COALESCE(hdrs->>'user-agent', ''), 300), '');
  ip  := NULLIF(split_part(COALESCE(hdrs->>'x-forwarded-for', ''), ',', 1), '');

  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN
    INSERT INTO public.admin_rpc_audit (actor_id, function_name, request_id, status, ip, user_agent)
    VALUES (actor, _function, rid, 'denied', ip, ua);
    RAISE EXCEPTION 'Admin role required';
  END IF;

  SELECT count(*) INTO recent
    FROM public.admin_rpc_audit a
   WHERE a.actor_id = actor
     AND a.function_name = _function
     AND a.status = 'ok'
     AND a.created_at > now() - _window;

  IF recent >= _limit THEN
    INSERT INTO public.admin_rpc_audit (actor_id, function_name, request_id, status, ip, user_agent, details)
    VALUES (actor, _function, rid, 'rate_limited', ip, ua,
            jsonb_build_object('limit', _limit, 'window', _window::text));
    RAISE EXCEPTION 'Admin RPC rate limit exceeded for % (max % calls per %)', _function, _limit, _window::text;
  END IF;

  INSERT INTO public.admin_rpc_audit (actor_id, function_name, request_id, status, ip, user_agent)
  VALUES (actor, _function, rid, 'ok', ip, ua);
END
$fn$;

REVOKE ALL ON FUNCTION public.admin_rpc_guard(text, integer, interval) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rpc_guard(text, integer, interval) TO authenticated, service_role;

-- 3. Convert the one SQL-language admin routine so it can carry the guard ----
CREATE OR REPLACE FUNCTION public.admin_audit_actors()
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT p.user_id, p.display_name
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin');
END
$fn$;

-- 4. Inject the guard into every public.admin_* routine ----------------------
--    Re-runnable: routines that already call the guard are skipped. Read-only
--    routines are made VOLATILE first, because a STABLE function may not write
--    the audit row.
DO $do$
DECLARE
  r record;
  def text;
  patched text;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           l.lanname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public'
       AND p.proname LIKE 'admin\_%'
       AND p.proname <> 'admin_rpc_guard'
  LOOP
    IF r.lanname <> 'plpgsql' THEN
      RAISE WARNING 'admin routine %(%) is % — guard not injected', r.proname, r.args, r.lanname;
      CONTINUE;
    END IF;

    def := pg_get_functiondef(r.oid);

    IF position('admin_rpc_guard' in def) > 0 THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER FUNCTION public.%I(%s) VOLATILE', r.proname, r.args);

    def := pg_get_functiondef(r.oid);
    patched := regexp_replace(
      def,
      '(AS \$function\$.*?\mBEGIN\M)',
      '\1' || E'\n  PERFORM public.admin_rpc_guard(' || quote_literal(r.proname) || E');',
      ''
    );

    IF patched = def THEN
      RAISE EXCEPTION 'could not inject admin guard into %(%)', r.proname, r.args;
    END IF;

    EXECUTE patched;
  END LOOP;
END
$do$;

-- 5. Lock the ACL for every admin routine (drift guard) ----------------------
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'admin\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
  END LOOP;
END
$do$;
