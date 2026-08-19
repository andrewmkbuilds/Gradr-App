ALTER TABLE public.feature_usage ADD COLUMN IF NOT EXISTS rollover integer NOT NULL DEFAULT 0;

-- Unused allowance from the previous month, capped at one month's allowance so
-- a dormant account cannot bank an unbounded balance.
CREATE OR REPLACE FUNCTION public.rollover_for(_user_id uuid, _feature text, _env text, _tier text, _period date)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  allowance integer := public.plan_allowance(_tier, _feature);
  prev_period date := (_period - interval '1 month')::date;
  prev_used integer := 0;
  prev_roll integer := 0;
BEGIN
  IF allowance IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(used,0), COALESCE(rollover,0) INTO prev_used, prev_roll
    FROM public.feature_usage
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = prev_period;
  IF NOT FOUND THEN RETURN 0; END IF;
  RETURN LEAST(GREATEST(allowance + prev_roll - prev_used, 0), allowance);
END $$;

REVOKE ALL ON FUNCTION public.rollover_for(uuid, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollover_for(uuid, text, text, text, date) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_entitlement(
  _user_id uuid, _feature text, _env text DEFAULT 'live', _amount integer DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tier text;
  allowance integer;
  period date := date_trunc('month', now())::date;
  used_now integer := 0;
  roll integer := 0;
  effective integer;
  credit_col text;
  credit_balance integer := 0;
BEGIN
  IF _feature NOT IN ('resume','application','interview') THEN
    RAISE EXCEPTION 'Unknown feature %', _feature;
  END IF;
  IF _amount IS NULL OR _amount < 1 OR _amount > 10 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  tier := public.current_plan_tier(_user_id, _env);
  allowance := public.plan_allowance(tier, _feature);

  INSERT INTO public.feature_usage (user_id, feature, environment, period_start, used, rollover)
  VALUES (_user_id, _feature, _env, period, 0,
          public.rollover_for(_user_id, _feature, _env, tier, period))
  ON CONFLICT (user_id, feature, environment, period_start) DO NOTHING;

  SELECT used, COALESCE(rollover,0) INTO used_now, roll FROM public.feature_usage
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period
   FOR UPDATE;

  effective := CASE WHEN allowance IS NULL THEN NULL ELSE allowance + roll END;

  IF effective IS NULL OR used_now + _amount <= effective THEN
    UPDATE public.feature_usage SET used = used + _amount
     WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;
    RETURN jsonb_build_object('allowed', true, 'source', 'plan', 'tier', tier,
      'allowance', effective, 'base_allowance', allowance, 'rollover', roll,
      'used', used_now + _amount,
      'remaining', CASE WHEN effective IS NULL THEN NULL ELSE effective - used_now - _amount END);
  END IF;

  credit_col := CASE _feature WHEN 'application' THEN 'application_credits'
                              WHEN 'interview' THEN 'interview_credits' ELSE NULL END;
  IF credit_col IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'tier', tier,
      'allowance', effective, 'rollover', roll, 'used', used_now, 'credits', 0);
  END IF;

  EXECUTE format(
    'SELECT COALESCE(%I,0) FROM public.usage_credits WHERE user_id = $1 AND environment = $2 FOR UPDATE', credit_col)
    INTO credit_balance USING _user_id, _env;

  IF credit_balance < _amount THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_credits', 'tier', tier,
      'allowance', effective, 'rollover', roll, 'used', used_now, 'credits', credit_balance);
  END IF;

  EXECUTE format(
    'UPDATE public.usage_credits SET %I = %I - $3 WHERE user_id = $1 AND environment = $2', credit_col, credit_col)
    USING _user_id, _env, _amount;

  UPDATE public.feature_usage SET used = used + _amount, credits_used = credits_used + _amount
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;

  RETURN jsonb_build_object('allowed', true, 'source', 'credits', 'tier', tier,
    'allowance', effective, 'rollover', roll, 'used', used_now + _amount,
    'credits', credit_balance - _amount);
END $$;

CREATE OR REPLACE FUNCTION public.entitlement_snapshot(_env text DEFAULT 'live')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  tier text;
  period date := date_trunc('month', now())::date;
  result jsonb := '{}'::jsonb;
  f text;
  allowance integer;
  used_now integer;
  roll integer;
  effective integer;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('tier','free'); END IF;
  tier := public.current_plan_tier(uid, _env);

  FOREACH f IN ARRAY ARRAY['resume','application','interview'] LOOP
    allowance := public.plan_allowance(tier, f);
    used_now := NULL; roll := NULL;
    SELECT COALESCE(used,0), COALESCE(rollover,0) INTO used_now, roll FROM public.feature_usage
     WHERE user_id = uid AND feature = f AND environment = _env AND period_start = period;
    used_now := COALESCE(used_now, 0);
    roll := COALESCE(roll, public.rollover_for(uid, f, _env, tier, period));
    effective := CASE WHEN allowance IS NULL THEN NULL ELSE allowance + roll END;
    result := result || jsonb_build_object(f, jsonb_build_object(
      'allowance', effective, 'base_allowance', allowance, 'rollover', roll, 'used', used_now,
      'remaining', CASE WHEN effective IS NULL THEN NULL ELSE GREATEST(effective - used_now, 0) END));
  END LOOP;

  RETURN jsonb_build_object('tier', tier, 'features', result);
END $$;