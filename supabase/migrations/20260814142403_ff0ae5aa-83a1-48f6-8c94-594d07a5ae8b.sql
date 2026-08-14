-- 1. API health events: extend for provider + rate-limit/backoff visualisation
ALTER TABLE public.api_health_events
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS rate_limited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retry_after_ms integer,
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS api_health_events_created_idx ON public.api_health_events (created_at DESC);
CREATE INDEX IF NOT EXISTS api_health_events_provider_idx ON public.api_health_events (provider, created_at DESC);

GRANT SELECT ON public.api_health_events TO authenticated;
GRANT ALL ON public.api_health_events TO service_role;

-- 2. CSP violation reports: admin read access (RLS was on with no policy)
GRANT SELECT ON public.csp_violation_reports TO authenticated;
GRANT ALL ON public.csp_violation_reports TO service_role;

DROP POLICY IF EXISTS "Admins read csp violation reports" ON public.csp_violation_reports;
CREATE POLICY "Admins read csp violation reports"
  ON public.csp_violation_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS csp_violation_reports_created_idx ON public.csp_violation_reports (created_at DESC);

-- 3. Webhook delivery logs
CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text,
  event_type text,
  event_id text,
  source text NOT NULL DEFAULT 'live',
  signature_present boolean NOT NULL DEFAULT false,
  signature_valid boolean,
  verification_error text,
  status text NOT NULL DEFAULT 'received',
  http_status integer,
  duration_ms integer,
  payload_digest text,
  payload_preview jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_delivery_logs_created_idx ON public.webhook_delivery_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_delivery_logs_provider_idx ON public.webhook_delivery_logs (provider, created_at DESC);

GRANT SELECT ON public.webhook_delivery_logs TO authenticated;
GRANT ALL ON public.webhook_delivery_logs TO service_role;

ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read webhook delivery logs" ON public.webhook_delivery_logs;
CREATE POLICY "Admins read webhook delivery logs"
  ON public.webhook_delivery_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));