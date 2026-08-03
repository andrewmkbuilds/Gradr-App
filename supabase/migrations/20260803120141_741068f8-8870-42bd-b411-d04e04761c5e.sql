-- ============================================================
-- Admin audit log
-- ============================================================
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('view','create','update','delete','export')),
  resource_type text NOT NULL,
  resource_id text,
  record_count integer NOT NULL DEFAULT 1,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Read: admins only. No INSERT/UPDATE/DELETE policies => append-only via
-- SECURITY DEFINER paths, immutable to every client role including admins.
CREATE POLICY "admins read audit log"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX idx_admin_audit_log_actor ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_log_resource ON public.admin_audit_log (resource_type, created_at DESC);

-- ============================================================
-- Rate limit guard for admin writes on tracking tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.assert_admin_write_rate_limit(_actor uuid, _limit integer DEFAULT 50)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recent integer;
BEGIN
  IF _actor IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO recent
  FROM public.admin_audit_log
  WHERE actor_id = _actor
    AND action IN ('update','delete')
    AND created_at > now() - interval '1 minute';

  IF recent >= _limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: more than % admin write actions in one minute. Wait a moment and retry.', _limit
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.assert_admin_write_rate_limit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_admin_write_rate_limit(uuid, integer) TO service_role;

-- ============================================================
-- Automatic audit trigger for UPDATE/DELETE on tracking tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_audit_tracking_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  act text := lower(TG_OP);
  rec_id text;
BEGIN
  PERFORM public.assert_admin_write_rate_limit(actor, 50);

  IF TG_OP = 'DELETE' THEN
    rec_id := OLD.id::text;
  ELSE
    rec_id := NEW.id::text;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (
    actor,
    act,
    TG_TABLE_NAME,
    rec_id,
    1,
    CASE WHEN TG_OP = 'DELETE'
      THEN jsonb_build_object('before', to_jsonb(OLD))
      ELSE jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
    END
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.trg_audit_tracking_write() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_affiliate_clicks_write
AFTER UPDATE OR DELETE ON public.affiliate_clicks
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_tracking_write();

CREATE TRIGGER audit_analytics_events_write
AFTER UPDATE OR DELETE ON public.analytics_events
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_tracking_write();

-- ============================================================
-- Explicit admin-verified logger (used for read/view + export events)
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_admin_access(
  _action text,
  _resource_type text,
  _record_count integer DEFAULT 1,
  _resource_id text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  new_id uuid;
  recent integer;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can write audit entries';
  END IF;

  IF _action NOT IN ('view','export') THEN
    RAISE EXCEPTION 'Only view/export actions may be logged explicitly';
  END IF;

  IF _resource_type NOT IN ('affiliate_clicks','analytics_events') THEN
    RAISE EXCEPTION 'Unsupported resource type';
  END IF;

  -- Collapse noisy repeat views: skip if same actor/resource logged in last 30s
  SELECT count(*) INTO recent
  FROM public.admin_audit_log
  WHERE actor_id = actor
    AND action = _action
    AND resource_type = _resource_type
    AND created_at > now() - interval '30 seconds';
  IF recent > 0 THEN RETURN NULL; END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (actor, _action, _resource_type, _resource_id, GREATEST(COALESCE(_record_count,0), 0), COALESCE(_details,'{}'::jsonb))
  RETURNING id INTO new_id;

  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) TO authenticated, service_role;

-- ============================================================
-- Admin-readable actor directory for the audit page (admins only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_audit_actors()
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.display_name
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin');
$$;

REVOKE EXECUTE ON FUNCTION public.admin_audit_actors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audit_actors() TO authenticated, service_role;