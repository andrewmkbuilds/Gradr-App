
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
