
CREATE TABLE IF NOT EXISTS public.email_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  observed numeric NOT NULL,
  baseline numeric,
  threshold numeric NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  notified_at timestamptz,
  notify_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric, window_start)
);
GRANT SELECT ON public.email_anomalies TO authenticated;
GRANT ALL ON public.email_anomalies TO service_role;
ALTER TABLE public.email_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read email anomalies" ON public.email_anomalies
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.endpoint_policy_overrides (
  endpoint text PRIMARY KEY,
  rate_limit integer,
  window_ms integer,
  backoff_seconds integer,
  max_backoff_seconds integer,
  disabled boolean NOT NULL DEFAULT false,
  alert_server_error integer,
  alert_rate_limited integer,
  alert_auth_rejected integer,
  alert_client_error integer,
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.endpoint_policy_overrides TO authenticated;
GRANT ALL ON public.endpoint_policy_overrides TO service_role;
ALTER TABLE public.endpoint_policy_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read endpoint overrides" ON public.endpoint_policy_overrides
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS email_anomalies_created_idx ON public.email_anomalies (created_at DESC);
