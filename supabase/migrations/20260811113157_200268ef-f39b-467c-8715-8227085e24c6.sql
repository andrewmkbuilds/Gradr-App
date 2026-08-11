-- 1. Environment separation ------------------------------------------------
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';
ALTER TABLE public.purchases   ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';
ALTER TABLE public.usage_credits ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

-- 2. Monthly feature usage ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  period_start date NOT NULL,
  used integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature, environment, period_start)
);

GRANT SELECT ON public.feature_usage TO authenticated;
GRANT ALL ON public.feature_usage TO service_role;

ALTER TABLE public.feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own feature usage"
  ON public.feature_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_feature_usage_updated
  BEFORE UPDATE ON public.feature_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Plan resolution ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_plan_tier(_user_id uuid, _env text DEFAULT 'live')
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN s.user_id IS NULL THEN 'free'
    -- Access survives dunning (past_due) and lasts until period end after cancel.
    WHEN s.subscription_status IN ('active','trialing','past_due')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
      THEN COALESCE(lower(s.subscription_tier), 'free')
    WHEN s.subscription_status IN ('canceled','paused')
      AND s.current_period_end > now()
      THEN COALESCE(lower(s.subscription_tier), 'free')
    ELSE 'free'
  END
  FROM (SELECT * FROM public.subscribers WHERE user_id = _user_id AND environment = _env LIMIT 1) s
  RIGHT JOIN (SELECT 1) dummy ON true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid, _env text DEFAULT 'live')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_plan_tier(_user_id, _env) IN ('starter','pro');
$$;

-- 4. Monthly plan allowances -------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_allowance(_tier text, _feature text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(_tier)
    WHEN 'pro' THEN NULL::integer            -- unlimited
    WHEN 'starter' THEN CASE _feature
      WHEN 'resume' THEN 20 WHEN 'application' THEN 10 WHEN 'interview' THEN 8 ELSE 20 END
    ELSE CASE _feature
      WHEN 'resume' THEN 3 WHEN 'application' THEN 1 WHEN 'interview' THEN 2 ELSE 3 END
  END;
$$;

-- 5. Consume an entitlement (plan quota first, then purchased credits) -------
CREATE OR REPLACE FUNCTION public.consume_entitlement(
  _user_id uuid, _feature text, _env text DEFAULT 'live', _amount integer DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tier text;
  allowance integer;
  period date := date_trunc('month', now())::date;
  used_now integer := 0;
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

  INSERT INTO public.feature_usage (user_id, feature, environment, period_start, used)
  VALUES (_user_id, _feature, _env, period, 0)
  ON CONFLICT (user_id, feature, environment, period_start) DO NOTHING;

  SELECT used INTO used_now FROM public.feature_usage
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period
   FOR UPDATE;

  -- Unlimited plan, or still inside the monthly allowance.
  IF allowance IS NULL OR used_now + _amount <= allowance THEN
    UPDATE public.feature_usage SET used = used + _amount
     WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;
    RETURN jsonb_build_object('allowed', true, 'source', 'plan', 'tier', tier,
      'allowance', allowance, 'used', used_now + _amount,
      'remaining', CASE WHEN allowance IS NULL THEN NULL ELSE allowance - used_now - _amount END);
  END IF;

  -- Allowance exhausted: fall back to purchased credits (resume has no pack).
  credit_col := CASE _feature WHEN 'application' THEN 'application_credits'
                              WHEN 'interview' THEN 'interview_credits' ELSE NULL END;
  IF credit_col IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'tier', tier,
      'allowance', allowance, 'used', used_now, 'credits', 0);
  END IF;

  EXECUTE format(
    'SELECT COALESCE(%I,0) FROM public.usage_credits WHERE user_id = $1 AND environment = $2 FOR UPDATE', credit_col)
    INTO credit_balance USING _user_id, _env;

  IF credit_balance < _amount THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_credits', 'tier', tier,
      'allowance', allowance, 'used', used_now, 'credits', credit_balance);
  END IF;

  EXECUTE format(
    'UPDATE public.usage_credits SET %I = %I - $3 WHERE user_id = $1 AND environment = $2', credit_col, credit_col)
    USING _user_id, _env, _amount;

  UPDATE public.feature_usage SET used = used + _amount, credits_used = credits_used + _amount
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;

  RETURN jsonb_build_object('allowed', true, 'source', 'credits', 'tier', tier,
    'allowance', allowance, 'used', used_now + _amount, 'credits', credit_balance - _amount);
END $$;

-- 6. Read-only snapshot for the UI ------------------------------------------
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
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('tier','free'); END IF;
  tier := public.current_plan_tier(uid, _env);

  FOREACH f IN ARRAY ARRAY['resume','application','interview'] LOOP
    allowance := public.plan_allowance(tier, f);
    SELECT COALESCE(used,0) INTO used_now FROM public.feature_usage
     WHERE user_id = uid AND feature = f AND environment = _env AND period_start = period;
    used_now := COALESCE(used_now, 0);
    result := result || jsonb_build_object(f, jsonb_build_object(
      'allowance', allowance, 'used', used_now,
      'remaining', CASE WHEN allowance IS NULL THEN NULL ELSE GREATEST(allowance - used_now, 0) END));
  END LOOP;

  RETURN jsonb_build_object('tier', tier, 'features', result);
END $$;

-- 7. Execution privileges ----------------------------------------------------
REVOKE ALL ON FUNCTION public.consume_entitlement(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_plan_tier(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_allowance(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_entitlement(uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_plan_tier(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entitlement_snapshot(text) TO authenticated, service_role;