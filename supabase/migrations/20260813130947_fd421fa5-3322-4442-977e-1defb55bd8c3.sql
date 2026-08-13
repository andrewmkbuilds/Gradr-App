CREATE TABLE public.csp_alert_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('spike','new-combo','readiness')),
  directive text,
  blocked_origin text,
  headline text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurrences integer NOT NULL DEFAULT 1,
  first_alerted_at timestamptz NOT NULL DEFAULT now(),
  last_alerted_at timestamptz NOT NULL DEFAULT now(),
  delivery_error text
);

CREATE INDEX csp_alert_notices_last_alerted_idx ON public.csp_alert_notices (last_alerted_at DESC);

GRANT ALL ON public.csp_alert_notices TO service_role;

ALTER TABLE public.csp_alert_notices ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.csp_alert_notices IS 'Dedupe ledger for CSP spike / new-combo / readiness alerts; service-role access only.';