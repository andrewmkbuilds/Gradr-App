-- Durable, cross-instance rate limiting for AI endpoints.
-- Replaces per-isolate in-memory counters that reset on cold start.

CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, endpoint, window_start)
);

-- Service-role only. No anon/authenticated grants: the browser must never
-- read or tamper with rate-limit counters.
GRANT ALL ON public.ai_rate_limits TO service_role;

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service_role bypasses RLS, everyone else is denied.

CREATE INDEX IF NOT EXISTS ai_rate_limits_created_idx
  ON public.ai_rate_limits (created_at);

CREATE OR REPLACE FUNCTION public.assert_ai_rate_limit(
  _user_id uuid,
  _endpoint text,
  _limit integer,
  _window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  win integer := GREATEST(COALESCE(_window_seconds, 60), 1);
  cap integer := GREATEST(COALESCE(_limit, 1), 1);
  bucket timestamptz;
  current_hits integer;
BEGIN
  IF _user_id IS NULL OR COALESCE(trim(_endpoint), '') = '' THEN
    RAISE EXCEPTION 'user id and endpoint are required';
  END IF;

  bucket := to_timestamp(floor(extract(epoch FROM now()) / win) * win);

  INSERT INTO public.ai_rate_limits (user_id, endpoint, window_start, hits)
  VALUES (_user_id, left(_endpoint, 100), bucket, 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET hits = public.ai_rate_limits.hits + 1
  RETURNING hits INTO current_hits;

  RETURN jsonb_build_object(
    'allowed', current_hits <= cap,
    'hits', current_hits,
    'limit', cap,
    'remaining', GREATEST(cap - current_hits, 0),
    'retry_after', GREATEST(ceil(extract(epoch FROM (bucket + make_interval(secs => win)) - now()))::int, 1)
  );
END $$;

-- Callable only by trusted server code.
REVOKE ALL ON FUNCTION public.assert_ai_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_ai_rate_limit(uuid, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_ai_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.ai_rate_limits WHERE created_at < now() - interval '1 day';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.prune_ai_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_ai_rate_limits() TO service_role;