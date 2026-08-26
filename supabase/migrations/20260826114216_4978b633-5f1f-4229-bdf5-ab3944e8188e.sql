CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, endpoint, window_start)
);

GRANT ALL ON public.ai_rate_limits TO service_role;

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_rate_limits' AND policyname='ai_rate_limits_own_read') THEN
    CREATE POLICY "ai_rate_limits_own_read" ON public.ai_rate_limits
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_rate_limits_window_idx ON public.ai_rate_limits (window_start);

-- Atomic, cross-isolate counter. Trusted server code only (service role).
CREATE OR REPLACE FUNCTION public.assert_ai_rate_limit(
  _user_id uuid,
  _endpoint text,
  _limit integer,
  _window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _win_start timestamptz;
  _hits integer;
  _retry integer;
BEGIN
  _window_seconds := GREATEST(COALESCE(_window_seconds, 60), 1);
  _limit := GREATEST(COALESCE(_limit, 1), 1);

  -- Fixed window bucket, aligned to the epoch so every isolate agrees.
  _win_start := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.ai_rate_limits (user_id, endpoint, window_start, hits)
  VALUES (_user_id, _endpoint, _win_start, 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET hits = public.ai_rate_limits.hits + 1, updated_at = now()
  RETURNING hits INTO _hits;

  _retry := GREATEST(1, CEIL(EXTRACT(epoch FROM (_win_start + make_interval(secs => _window_seconds)) - now()))::int);

  RETURN jsonb_build_object(
    'allowed', _hits <= _limit,
    'hits', _hits,
    'limit', _limit,
    'remaining', GREATEST(0, _limit - _hits),
    'retry_after', _retry
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assert_ai_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_ai_rate_limit(uuid, text, integer, integer) TO service_role;

-- Keeps the counter table from growing without bound.
CREATE OR REPLACE FUNCTION public.purge_ai_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.ai_rate_limits WHERE window_start < now() - interval '1 day';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_ai_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_ai_rate_limits() TO service_role;