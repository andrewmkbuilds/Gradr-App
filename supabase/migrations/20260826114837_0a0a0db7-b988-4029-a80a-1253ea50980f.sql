-- Throttled AI calls now leave the same audit trail as admin RPCs, so a
-- rate-limited resume analysis can be correlated by request id.
CREATE OR REPLACE FUNCTION public.assert_ai_rate_limit(
  _user_id uuid,
  _endpoint text,
  _limit integer,
  _window_seconds integer DEFAULT 60,
  _request_id text DEFAULT NULL
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
  _allowed boolean;
BEGIN
  _window_seconds := GREATEST(COALESCE(_window_seconds, 60), 1);
  _limit := GREATEST(COALESCE(_limit, 1), 1);

  _win_start := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.ai_rate_limits (user_id, endpoint, window_start, hits)
  VALUES (_user_id, _endpoint, _win_start, 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET hits = public.ai_rate_limits.hits + 1, updated_at = now()
  RETURNING hits INTO _hits;

  _retry := GREATEST(1, CEIL(EXTRACT(epoch FROM (_win_start + make_interval(secs => _window_seconds)) - now()))::int);
  _allowed := _hits <= _limit;

  IF NOT _allowed THEN
    INSERT INTO public.admin_rpc_audit (actor_id, function_name, request_id, status, details)
    VALUES (
      _user_id,
      _endpoint,
      _request_id,
      'rate_limited',
      jsonb_build_object(
        'hits', _hits,
        'limit', _limit,
        'retry_after', _retry,
        'retry_after_ms', _retry * 1000,
        'window_seconds', _window_seconds,
        'source', 'ai_rate_limit'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', _allowed,
    'hits', _hits,
    'limit', _limit,
    'remaining', GREATEST(0, _limit - _hits),
    'retry_after', _retry,
    'request_id', _request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assert_ai_rate_limit(uuid, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_ai_rate_limit(uuid, text, integer, integer, text) TO service_role;

DROP FUNCTION IF EXISTS public.assert_ai_rate_limit(uuid, text, integer, integer);