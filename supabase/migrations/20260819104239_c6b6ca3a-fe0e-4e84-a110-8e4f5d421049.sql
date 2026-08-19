
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  event_type text NOT NULL,
  title text NOT NULL,
  description text,
  amount_total integer,
  currency text,
  subscription_id text,
  transaction_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_events_dedupe
  ON public.billing_events(user_id, environment, event_type, coalesce(transaction_id, subscription_id, ''), occurred_at);
CREATE INDEX IF NOT EXISTS billing_events_user_idx ON public.billing_events(user_id, environment, occurred_at DESC);

GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own billing events" ON public.billing_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all billing events" ON public.billing_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.dunning_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  subscription_id text,
  status text NOT NULL DEFAULT 'active',
  attempt_count integer NOT NULL DEFAULT 1,
  max_attempts integer NOT NULL DEFAULT 4,
  amount_due integer,
  currency text,
  last_failure_at timestamptz NOT NULL DEFAULT now(),
  next_retry_at timestamptz,
  last_notified_at timestamptz,
  recovered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dunning_state_unique
  ON public.dunning_state(user_id, environment, coalesce(subscription_id, ''));

GRANT SELECT ON public.dunning_state TO authenticated;
GRANT ALL ON public.dunning_state TO service_role;
ALTER TABLE public.dunning_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dunning state" ON public.dunning_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all dunning state" ON public.dunning_state
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER dunning_state_updated_at
  BEFORE UPDATE ON public.dunning_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.billing_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  environment text NOT NULL DEFAULT 'sandbox',
  subject text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  notified_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_alerts_dedupe ON public.billing_alerts(dedupe_key);

GRANT SELECT ON public.billing_alerts TO authenticated;
GRANT ALL ON public.billing_alerts TO service_role;
ALTER TABLE public.billing_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view billing alerts" ON public.billing_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER billing_alerts_updated_at
  BEFORE UPDATE ON public.billing_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz;
