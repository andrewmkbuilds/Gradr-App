DROP POLICY IF EXISTS "own credits readable" ON public.usage_credits;

CREATE POLICY "own credits readable"
ON public.usage_credits
FOR SELECT
TO authenticated
USING (
  coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

REVOKE ALL ON FUNCTION public.lookup_affiliate_by_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_affiliate_public_settings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lookup_affiliate_by_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_affiliate_public_settings() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

DROP POLICY IF EXISTS "Users read own verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own verification docs" ON storage.objects;

CREATE POLICY "Users read own verification docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'verification-docs'
  AND coalesce(((auth.jwt() ->> 'is_anonymous'))::boolean, false) = false
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_admin()
  )
);

CREATE POLICY "Users upload own verification docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'verification-docs'
  AND coalesce(((auth.jwt() ->> 'is_anonymous'))::boolean, false) = false
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own verification docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'verification-docs'
  AND coalesce(((auth.jwt() ->> 'is_anonymous'))::boolean, false) = false
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.discovered_jobs FROM anon, authenticated;
REVOKE SELECT ON public.discovered_jobs FROM anon;
GRANT SELECT ON public.discovered_jobs TO authenticated;
GRANT ALL ON public.discovered_jobs TO service_role;

DROP POLICY IF EXISTS "Service role manages discovered jobs" ON public.discovered_jobs;
CREATE POLICY "Service role manages discovered jobs"
ON public.discovered_jobs FOR ALL TO service_role
USING (true) WITH CHECK (true);

REVOKE ALL ON public.affiliate_settings FROM anon;
GRANT SELECT, UPDATE ON public.affiliate_settings TO authenticated;
GRANT ALL ON public.affiliate_settings TO service_role;

DROP POLICY IF EXISTS "Admins read affiliate settings" ON public.affiliate_settings;
DROP POLICY IF EXISTS "Admins can read affiliate settings" ON public.affiliate_settings;
DROP POLICY IF EXISTS "Admins view affiliate settings" ON public.affiliate_settings;
DROP POLICY IF EXISTS "Admins manage affiliate settings" ON public.affiliate_settings;
CREATE POLICY "Admins manage affiliate settings"
ON public.affiliate_settings FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE EXECUTE ON FUNCTION public.admin_audit_actors() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_legal_document_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_review_verification_request(uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_verification_requests(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_audit_actors() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_legal_document_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_verification_request(uuid, text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_verification_requests(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) TO service_role;

REVOKE INSERT, DELETE, TRUNCATE, REFERENCES ON public.affiliate_settings FROM authenticated;

CREATE TABLE IF NOT EXISTS public.api_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer NOT NULL,
  outcome text NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  error_message text,
  environment text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_health_events_created_idx ON public.api_health_events (created_at DESC);
CREATE INDEX IF NOT EXISTS api_health_events_endpoint_idx ON public.api_health_events (endpoint, created_at DESC);

GRANT SELECT ON public.api_health_events TO authenticated;
GRANT ALL ON public.api_health_events TO service_role;
ALTER TABLE public.api_health_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read api health events" ON public.api_health_events;
CREATE POLICY "Admins read api health events" ON public.api_health_events
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.api_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  kind text NOT NULL,
  message text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS api_health_alerts_open_idx
  ON public.api_health_alerts (endpoint, kind) WHERE resolved = false;

GRANT SELECT, UPDATE ON public.api_health_alerts TO authenticated;
GRANT ALL ON public.api_health_alerts TO service_role;
ALTER TABLE public.api_health_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read api health alerts" ON public.api_health_alerts;
CREATE POLICY "Admins read api health alerts" ON public.api_health_alerts
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins resolve api health alerts" ON public.api_health_alerts;
CREATE POLICY "Admins resolve api health alerts" ON public.api_health_alerts
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text,
  environment text,
  state text NOT NULL DEFAULT 'processing',
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_created_idx ON public.webhook_deliveries (created_at DESC);

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Admins read webhook deliveries" ON public.webhook_deliveries
  FOR SELECT TO authenticated USING (public.is_admin());

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_anonymous_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) TO anon, authenticated;