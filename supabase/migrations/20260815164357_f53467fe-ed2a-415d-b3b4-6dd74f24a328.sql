-- Ledger of every server-side analytics event Gradr sends to PostHog.
CREATE TABLE public.analytics_event_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  distinct_id text,
  source text NOT NULL DEFAULT 'payments-webhook',
  provider_event_id text,
  environment text,
  dedupe_key text,
  status text NOT NULL CHECK (status IN ('ok','failed','skipped')),
  http_status integer,
  latency_ms integer,
  error text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_event_deliveries_occurred_idx
  ON public.analytics_event_deliveries (occurred_at DESC);
CREATE INDEX analytics_event_deliveries_event_idx
  ON public.analytics_event_deliveries (event_name, occurred_at DESC);
CREATE INDEX analytics_event_deliveries_dedupe_idx
  ON public.analytics_event_deliveries (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

GRANT SELECT ON public.analytics_event_deliveries TO authenticated;
GRANT ALL ON public.analytics_event_deliveries TO service_role;
ALTER TABLE public.analytics_event_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read analytics deliveries"
  ON public.analytics_event_deliveries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Detected tracking regressions.
CREATE TABLE public.analytics_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  event_name text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  notified_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One alert per regression per window, so a repeated check cannot spam.
CREATE UNIQUE INDEX analytics_alerts_unique_idx
  ON public.analytics_alerts (kind, coalesce(event_name, ''), window_start);
CREATE INDEX analytics_alerts_open_idx
  ON public.analytics_alerts (created_at DESC) WHERE resolved_at IS NULL;

GRANT SELECT, UPDATE ON public.analytics_alerts TO authenticated;
GRANT ALL ON public.analytics_alerts TO service_role;
ALTER TABLE public.analytics_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read analytics alerts"
  ON public.analytics_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins resolve analytics alerts"
  ON public.analytics_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Regression detector. Compares what billing did against what analytics
-- recorded over a rolling window and files one alert per distinct problem.
CREATE OR REPLACE FUNCTION public.detect_analytics_regressions(p_window interval DEFAULT interval '1 hour')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w_start timestamptz := date_trunc('minute', now() - p_window);
  w_end   timestamptz := date_trunc('minute', now());
  filed   integer := 0;
  rec     record;
BEGIN
  -- 1. Sends that failed outright.
  FOR rec IN
    SELECT event_name, count(*) AS n, max(error) AS sample
    FROM public.analytics_event_deliveries
    WHERE occurred_at >= w_start AND status = 'failed'
    GROUP BY event_name
  LOOP
    INSERT INTO public.analytics_alerts (kind, severity, event_name, detail, window_start, window_end)
    VALUES ('capture_failed', 'critical', rec.event_name,
            jsonb_build_object('failures', rec.n, 'sample_error', rec.sample), w_start, w_end)
    ON CONFLICT DO NOTHING;
    filed := filed + 1;
  END LOOP;

  -- 2. The same logical event sent more than once (double counting).
  FOR rec IN
    SELECT event_name, count(*) AS n
    FROM (
      SELECT event_name, dedupe_key
      FROM public.analytics_event_deliveries
      WHERE occurred_at >= w_start AND dedupe_key IS NOT NULL AND status = 'ok'
      GROUP BY event_name, dedupe_key
      HAVING count(*) > 1
    ) dupes
    GROUP BY event_name
  LOOP
    INSERT INTO public.analytics_alerts (kind, severity, event_name, detail, window_start, window_end)
    VALUES ('duplicate_event', 'warning', rec.event_name,
            jsonb_build_object('duplicate_keys', rec.n), w_start, w_end)
    ON CONFLICT DO NOTHING;
    filed := filed + 1;
  END LOOP;

  -- 3. Sends that succeeded but took long enough to distort real-time funnels.
  FOR rec IN
    SELECT event_name, max(latency_ms) AS worst, count(*) AS n
    FROM public.analytics_event_deliveries
    WHERE occurred_at >= w_start AND status = 'ok' AND latency_ms > 5000
    GROUP BY event_name
  LOOP
    INSERT INTO public.analytics_alerts (kind, severity, event_name, detail, window_start, window_end)
    VALUES ('delayed_event', 'warning', rec.event_name,
            jsonb_build_object('slow_sends', rec.n, 'worst_latency_ms', rec.worst), w_start, w_end)
    ON CONFLICT DO NOTHING;
    filed := filed + 1;
  END LOOP;

  -- 4. Payment webhooks that never finished processing: no handler ran, so no
  --    revenue event could have been emitted.
  FOR rec IN
    SELECT event_type, count(*) AS n, max(last_error) AS sample
    FROM public.webhook_deliveries
    WHERE created_at >= w_start AND state <> 'processed'
    GROUP BY event_type
  LOOP
    INSERT INTO public.analytics_alerts (kind, severity, event_name, detail, window_start, window_end)
    VALUES ('webhook_unprocessed', 'critical', rec.event_type,
            jsonb_build_object('deliveries', rec.n, 'sample_error', rec.sample), w_start, w_end)
    ON CONFLICT DO NOTHING;
    filed := filed + 1;
  END LOOP;

  -- 5. Money moved but the funnel event is missing: a processed subscription
  --    webhook with no matching analytics delivery is a tracking regression.
  FOR rec IN
    SELECT e.expected AS event_name, count(*) AS n
    FROM public.webhook_deliveries d
    CROSS JOIN LATERAL (
      VALUES ('subscription_created'), ('payment_completed'), ('upgraded_to_premium')
    ) AS e(expected)
    WHERE d.created_at >= w_start
      AND d.created_at <= w_end - interval '5 minutes'   -- grace period
      AND d.state = 'processed'
      AND d.event_type = 'subscription.created'
      AND NOT EXISTS (
        SELECT 1 FROM public.analytics_event_deliveries a
        WHERE a.provider_event_id = d.event_id
          AND a.event_name = e.expected
          AND a.status = 'ok'
      )
    GROUP BY e.expected
  LOOP
    INSERT INTO public.analytics_alerts (kind, severity, event_name, detail, window_start, window_end)
    VALUES ('missing_event', 'critical', rec.event_name,
            jsonb_build_object('paid_conversions_untracked', rec.n), w_start, w_end)
    ON CONFLICT DO NOTHING;
    filed := filed + 1;
  END LOOP;

  RETURN filed;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_analytics_regressions(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_analytics_regressions(interval) TO service_role;

-- Runs every 15 minutes so a tracking regression surfaces within one window.
SELECT cron.schedule(
  'detect-analytics-regressions',
  '*/15 * * * *',
  $cron$SELECT public.detect_analytics_regressions(interval '1 hour');$cron$
);