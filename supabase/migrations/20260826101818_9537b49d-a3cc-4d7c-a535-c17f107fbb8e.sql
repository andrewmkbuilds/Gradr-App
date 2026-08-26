-- 1. Archive table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_rpc_audit_archive (
  id uuid PRIMARY KEY,
  actor_id uuid,
  function_name text NOT NULL,
  request_id text,
  status text NOT NULL,
  ip text,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_rpc_audit_archive TO authenticated;
GRANT ALL ON public.admin_rpc_audit_archive TO service_role;

ALTER TABLE public.admin_rpc_audit_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read admin rpc audit archive" ON public.admin_rpc_audit_archive;
CREATE POLICY "Admins read admin rpc audit archive"
ON public.admin_rpc_audit_archive
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_admin_rpc_audit_archive_created_at
  ON public.admin_rpc_audit_archive (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_rpc_audit_archive_fn
  ON public.admin_rpc_audit_archive (function_name, created_at DESC);

-- 2. Retention settings (single row) ------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_rpc_audit_retention (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  retention_days integer NOT NULL DEFAULT 90,
  archive_enabled boolean NOT NULL DEFAULT true,
  archive_retention_days integer NOT NULL DEFAULT 365,
  purge_enabled boolean NOT NULL DEFAULT true,
  last_purge_at timestamptz,
  last_purge_result jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_rpc_audit_retention TO authenticated;
GRANT ALL ON public.admin_rpc_audit_retention TO service_role;

ALTER TABLE public.admin_rpc_audit_retention ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read rpc audit retention" ON public.admin_rpc_audit_retention;
CREATE POLICY "Admins read rpc audit retention"
ON public.admin_rpc_audit_retention
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.admin_rpc_audit_retention (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_admin_rpc_audit_retention_updated_at ON public.admin_rpc_audit_retention;
CREATE TRIGGER trg_admin_rpc_audit_retention_updated_at
BEFORE UPDATE ON public.admin_rpc_audit_retention
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Purge / archival routine (service role + cron) ---------------------------
CREATE OR REPLACE FUNCTION public.purge_admin_rpc_audit()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  cfg public.admin_rpc_audit_retention;
  archived integer := 0;
  deleted integer := 0;
  archive_pruned integer := 0;
  result jsonb;
BEGIN
  SELECT * INTO cfg FROM public.admin_rpc_audit_retention WHERE id;
  IF cfg.id IS NULL OR NOT cfg.purge_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'purge disabled');
  END IF;

  IF cfg.archive_enabled THEN
    WITH moved AS (
      DELETE FROM public.admin_rpc_audit a
       WHERE a.created_at < now() - make_interval(days => cfg.retention_days)
      RETURNING a.*
    ), ins AS (
      INSERT INTO public.admin_rpc_audit_archive
        (id, actor_id, function_name, request_id, status, ip, user_agent, details, created_at)
      SELECT m.id, m.actor_id, m.function_name, m.request_id, m.status, m.ip, m.user_agent, m.details, m.created_at
        FROM moved m
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO archived FROM ins;
  ELSE
    DELETE FROM public.admin_rpc_audit a
     WHERE a.created_at < now() - make_interval(days => cfg.retention_days);
    GET DIAGNOSTICS deleted = ROW_COUNT;
  END IF;

  DELETE FROM public.admin_rpc_audit_archive ar
   WHERE ar.created_at < now() - make_interval(days => cfg.archive_retention_days);
  GET DIAGNOSTICS archive_pruned = ROW_COUNT;

  result := jsonb_build_object(
    'ran_at', now(),
    'archived', archived,
    'deleted', deleted,
    'archive_pruned', archive_pruned,
    'retention_days', cfg.retention_days,
    'archive_enabled', cfg.archive_enabled,
    'archive_retention_days', cfg.archive_retention_days
  );

  UPDATE public.admin_rpc_audit_retention
     SET last_purge_at = now(), last_purge_result = result
   WHERE id;

  RETURN result;
END
$fn$;

-- 4. Admin-facing routines (guarded like every other admin_* routine) ---------
CREATE OR REPLACE FUNCTION public.admin_rpc_audit_retention_settings()
RETURNS public.admin_rpc_audit_retention
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE row public.admin_rpc_audit_retention;
BEGIN
  PERFORM public.admin_rpc_guard('admin_rpc_audit_retention_settings');
  SELECT * INTO row FROM public.admin_rpc_audit_retention WHERE id;
  RETURN row;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_update_rpc_audit_retention(
  _retention_days integer,
  _archive_enabled boolean,
  _archive_retention_days integer,
  _purge_enabled boolean
)
RETURNS public.admin_rpc_audit_retention
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE row public.admin_rpc_audit_retention;
BEGIN
  PERFORM public.admin_rpc_guard('admin_update_rpc_audit_retention');

  IF _retention_days < 7 OR _retention_days > 3650
     OR _archive_retention_days < 7 OR _archive_retention_days > 3650 THEN
    RAISE EXCEPTION 'Retention windows must be between 7 and 3650 days';
  END IF;

  IF _archive_enabled AND _archive_retention_days < _retention_days THEN
    RAISE EXCEPTION 'Archive retention must be at least as long as live retention';
  END IF;

  UPDATE public.admin_rpc_audit_retention
     SET retention_days = _retention_days,
         archive_enabled = _archive_enabled,
         archive_retention_days = _archive_retention_days,
         purge_enabled = _purge_enabled,
         updated_by = auth.uid()
   WHERE id
  RETURNING * INTO row;

  RETURN row;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_run_rpc_audit_purge()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM public.admin_rpc_guard('admin_run_rpc_audit_purge');
  RETURN public.purge_admin_rpc_audit();
END
$fn$;

-- 5. Grants -------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.purge_admin_rpc_audit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_admin_rpc_audit() TO service_role;

REVOKE ALL ON FUNCTION public.admin_rpc_audit_retention_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rpc_audit_retention_settings() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_update_rpc_audit_retention(integer, boolean, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_rpc_audit_retention(integer, boolean, integer, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_run_rpc_audit_purge() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_run_rpc_audit_purge() TO authenticated, service_role;

-- 6. Nightly schedule ---------------------------------------------------------
DO $$ BEGIN PERFORM cron.unschedule('admin-rpc-audit-purge'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('admin-rpc-audit-purge', '45 3 * * *', $CRON$ SELECT public.purge_admin_rpc_audit(); $CRON$);