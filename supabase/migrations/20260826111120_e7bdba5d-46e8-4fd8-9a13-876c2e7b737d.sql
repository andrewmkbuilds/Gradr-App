-- ============================================================================
-- Fix admin health pages: missing GRANTs, missing columns, missing table/function
-- ============================================================================

-- 1. Add missing GRANTs to health/analytics tables (admin-gated by RLS)
GRANT SELECT ON public.api_health_events TO authenticated;
GRANT ALL ON public.api_health_events TO service_role;

GRANT SELECT, UPDATE ON public.api_health_alerts TO authenticated;
GRANT ALL ON public.api_health_alerts TO service_role;

GRANT SELECT, UPDATE ON public.analytics_alerts TO authenticated;
GRANT ALL ON public.analytics_alerts TO service_role;

GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

-- 2. Add missing columns to api_health_events (selected by AdminApiHealth page)
ALTER TABLE public.api_health_events
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS rate_limited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retry_after_ms integer,
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_api_health_events_created_at
  ON public.api_health_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_health_events_provider
  ON public.api_health_events (provider);

-- 3. Create analytics_event_deliveries table (expected by analytics-monitor edge fn)
CREATE TABLE IF NOT EXISTS public.analytics_event_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  latency_ms integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  provider_event_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.analytics_event_deliveries TO authenticated;
GRANT ALL ON public.analytics_event_deliveries TO service_role;

ALTER TABLE public.analytics_event_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read analytics event deliveries"
  ON public.analytics_event_deliveries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_analytics_event_deliveries_occurred_at
  ON public.analytics_event_deliveries (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_event_deliveries_event_status
  ON public.analytics_event_deliveries (event_name, status);

-- 4. Create detect_analytics_regressions function (called by analytics-monitor edge fn)
CREATE OR REPLACE FUNCTION public.detect_analytics_regressions(p_window text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerts_found integer := 0;
  v_window_start timestamptz := now() - (p_window)::interval;
  v_count integer;
  v_existing integer;
  ev text;
BEGIN
  -- Check for failed deliveries (capture_failed)
  FOR ev IN SELECT unnest(ARRAY['payment_completed', 'subscription_created', 'upgraded_to_premium']) LOOP
    SELECT count(*) INTO v_count
    FROM public.analytics_event_deliveries
    WHERE event_name = ev
      AND status = 'failed'
      AND occurred_at >= v_window_start;

    IF v_count > 0 THEN
      SELECT count(*) INTO v_existing
      FROM public.analytics_alerts
      WHERE kind = 'capture_failed'
        AND event_name = ev
        AND resolved_at IS NULL
        AND created_at >= v_window_start;

      IF v_existing = 0 THEN
        INSERT INTO public.analytics_alerts (kind, severity, event_name, detail, window_start, window_end)
        VALUES ('capture_failed', 'critical', ev,
          jsonb_build_object('failed_count', v_count, 'window', p_window),
          v_window_start, now());
        v_alerts_found := v_alerts_found + 1;
      END IF;
    END IF;
  END LOOP;

  -- Check for duplicate deliveries (same provider_event_id + event_name)
  FOR ev IN SELECT unnest(ARRAY['payment_completed', 'subscription_created', 'upgraded_to_premium']) LOOP
    SELECT count(*) - count(DISTINCT provider_event_id) INTO v_count
    FROM public.analytics_event_deliveries
    WHERE event_name = ev
      AND status = 'ok'
      AND provider_event_id IS NOT NULL
      AND occurred_at >= v_window_start;

    IF v_count > 0 THEN
      SELECT count(*) INTO v_existing
      FROM public.analytics_alerts
      WHERE kind = 'duplicated'
        AND event_name = ev
        AND resolved_at IS NULL
        AND created_at >= v_window_start;

      IF v_existing = 0 THEN
        INSERT INTO public.analytics_alerts (kind, severity, event_name, detail, window_start, window_end)
        VALUES ('duplicated', 'warning', ev,
          jsonb_build_object('duplicate_count', v_count, 'window', p_window),
          v_window_start, now());
        v_alerts_found := v_alerts_found + 1;
      END IF;
    END IF;
  END LOOP;

  -- Check for missing critical events (zero deliveries in window)
  FOR ev IN SELECT unnest(ARRAY['payment_completed', 'subscription_created', 'upgraded_to_premium']) LOOP
    SELECT count(*) INTO v_count
    FROM public.analytics_event_deliveries
    WHERE event_name = ev
      AND occurred_at >= v_window_start;

    IF v_count = 0 THEN
      SELECT count(*) INTO v_existing
      FROM public.analytics_alerts
      WHERE kind = 'missing'
        AND event_name = ev
        AND resolved_at IS NULL
        AND created_at >= v_window_start;

      IF v_existing = 0 THEN
        INSERT INTO public.analytics_alerts (kind, severity, event_name, detail, window_start, window_end)
        VALUES ('missing', 'critical', ev,
          jsonb_build_object('window', p_window),
          v_window_start, now());
        v_alerts_found := v_alerts_found + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_alerts_found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_analytics_regressions(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_analytics_regressions(text) TO authenticated;