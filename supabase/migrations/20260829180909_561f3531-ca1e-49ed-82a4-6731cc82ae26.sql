-- 1. Trial tracking on subscribers -----------------------------------------
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS trial_start timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscribers_trial_end
  ON public.subscribers (trial_end)
  WHERE trial_end IS NOT NULL;

-- 2. Billing-anniversary allowance period ------------------------------------
CREATE OR REPLACE FUNCTION public.billing_period_start(
  _user_id uuid,
  _env text DEFAULT 'live'::text,
  _at timestamptz DEFAULT now()
)
RETURNS date
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  anchor timestamptz;
  anchor_day integer;
  base date := date_trunc('month', _at)::date;
  dim integer;
  cand date;
BEGIN
  SELECT current_period_end INTO anchor
    FROM public.subscribers
   WHERE user_id = _user_id
     AND environment = _env
     AND subscription_tier IS NOT NULL
     AND current_period_end IS NOT NULL
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  -- No plan (or no known billing date): keep calendar months.
  IF anchor IS NULL THEN
    RETURN base;
  END IF;

  anchor_day := EXTRACT(day FROM anchor)::integer;

  -- Anniversary inside the month of _at, clamped to the length of that month.
  dim := EXTRACT(day FROM (date_trunc('month', _at) + interval '1 month - 1 day'))::integer;
  cand := base + (LEAST(anchor_day, dim) - 1);

  IF cand > _at::date THEN
    base := (date_trunc('month', _at) - interval '1 month')::date;
    dim := EXTRACT(day FROM (date_trunc('month', _at) - interval '1 day'))::integer;
    cand := base + (LEAST(anchor_day, dim) - 1);
  END IF;

  RETURN cand;
END $function$;

REVOKE ALL ON FUNCTION public.billing_period_start(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_period_start(uuid, text, timestamptz) TO authenticated, service_role;

-- 3. Metering now uses the anniversary period --------------------------------
CREATE OR REPLACE FUNCTION public.consume_entitlement(_user_id uuid, _feature text, _env text DEFAULT 'live'::text, _amount integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tier text;
  allowance integer;
  period date := public.billing_period_start(_user_id, _env, now());
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
END $function$;

CREATE OR REPLACE FUNCTION public.refund_entitlement(_user_id uuid, _feature text, _env text DEFAULT 'live'::text, _amount integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  period date := public.billing_period_start(_user_id, _env, now());
  row_used integer;
  row_credits integer;
  credit_col text;
BEGIN
  IF _feature NOT IN ('resume','application','interview') THEN RETURN; END IF;
  IF _amount IS NULL OR _amount < 1 OR _amount > 10 THEN RETURN; END IF;

  SELECT used, credits_used INTO row_used, row_credits
    FROM public.feature_usage
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period
   FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.feature_usage
     SET used = GREATEST(used - _amount, 0),
         credits_used = GREATEST(credits_used - LEAST(_amount, row_credits), 0)
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;

  IF row_credits >= _amount THEN
    credit_col := CASE _feature WHEN 'application' THEN 'application_credits'
                                WHEN 'interview' THEN 'interview_credits' ELSE NULL END;
    IF credit_col IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.usage_credits SET %I = %I + $3 WHERE user_id = $1 AND environment = $2',
        credit_col, credit_col) USING _user_id, _env, _amount;
    END IF;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.entitlement_snapshot(_env text DEFAULT 'live'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  tier text;
  period date;
  result jsonb := '{}'::jsonb;
  f text;
  allowance integer;
  used_now integer;
  roll integer;
  effective integer;
  sub RECORD;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('tier','free'); END IF;
  tier := public.current_plan_tier(uid, _env);
  period := public.billing_period_start(uid, _env, now());

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

  SELECT subscription_status, trial_end INTO sub
    FROM public.subscribers
   WHERE user_id = uid AND environment = _env
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  RETURN jsonb_build_object(
    'tier', tier,
    'features', result,
    'period_start', period,
    'period_end', (period + interval '1 month')::date,
    'trialing', COALESCE(sub.subscription_status = 'trialing', false),
    'trial_end', sub.trial_end
  );
END $function$;

-- 4. Safe backfill: move current calendar-month usage onto the new period ----
DO $backfill$
DECLARE
  r RECORD;
  np date;
  existing RECORD;
BEGIN
  FOR r IN
    SELECT * FROM public.feature_usage
     WHERE period_start = date_trunc('month', now())::date
  LOOP
    np := public.billing_period_start(r.user_id, r.environment, now());
    CONTINUE WHEN np = r.period_start;

    SELECT * INTO existing FROM public.feature_usage
     WHERE user_id = r.user_id AND feature = r.feature
       AND environment = r.environment AND period_start = np;

    IF FOUND THEN
      -- Merge, so the spent allowance carries over instead of resetting.
      UPDATE public.feature_usage
         SET used = existing.used + r.used,
             credits_used = COALESCE(existing.credits_used,0) + COALESCE(r.credits_used,0),
             rollover = GREATEST(COALESCE(existing.rollover,0), COALESCE(r.rollover,0))
       WHERE id = existing.id;
      DELETE FROM public.feature_usage WHERE id = r.id;
    ELSE
      UPDATE public.feature_usage SET period_start = np WHERE id = r.id;
    END IF;
  END LOOP;
END $backfill$;