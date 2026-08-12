CREATE TABLE public.security_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('billing_webhook','entitlement_check','ai_authorization')),
  event text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allowed','denied','received','processed','failed')),
  user_id uuid,
  feature text,
  environment text,
  reason text,
  source text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own security events"
  ON public.security_audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all security events"
  ON public.security_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX security_audit_log_created_idx ON public.security_audit_log (created_at DESC);
CREATE INDEX security_audit_log_user_idx ON public.security_audit_log (user_id, created_at DESC);
CREATE INDEX security_audit_log_category_idx ON public.security_audit_log (category, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_security_event(
  _category text, _event text, _decision text, _user_id uuid DEFAULT NULL,
  _feature text DEFAULT NULL, _env text DEFAULT NULL, _reason text DEFAULT NULL,
  _source text DEFAULT NULL, _details jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.security_audit_log
    (category, event, decision, user_id, feature, environment, reason, source, details)
  VALUES (_category, _event, _decision, _user_id, _feature, _env, _reason, _source,
          COALESCE(_details, '{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END $function$;

REVOKE ALL ON FUNCTION public.record_security_event(text, text, text, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_security_event(text, text, text, uuid, text, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_entitlement(_user_id uuid, _feature text, _env text DEFAULT 'live'::text, _amount integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tier text;
  allowance integer;
  period date := date_trunc('month', now())::date;
  used_now integer := 0;
  credit_col text;
  credit_balance integer := 0;
  result jsonb;
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

  IF allowance IS NULL OR used_now + _amount <= allowance THEN
    UPDATE public.feature_usage SET used = used + _amount
     WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;
    result := jsonb_build_object('allowed', true, 'source', 'plan', 'tier', tier,
      'allowance', allowance, 'used', used_now + _amount,
      'remaining', CASE WHEN allowance IS NULL THEN NULL ELSE allowance - used_now - _amount END);
    PERFORM public.record_security_event('entitlement_check', 'consume', 'allowed', _user_id,
      _feature, _env, 'plan_allowance', 'consume_entitlement', result);
    RETURN result;
  END IF;

  credit_col := CASE _feature WHEN 'application' THEN 'application_credits'
                              WHEN 'interview' THEN 'interview_credits' ELSE NULL END;
  IF credit_col IS NULL THEN
    result := jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'tier', tier,
      'allowance', allowance, 'used', used_now, 'credits', 0);
    PERFORM public.record_security_event('entitlement_check', 'consume', 'denied', _user_id,
      _feature, _env, 'quota_exceeded', 'consume_entitlement', result);
    RETURN result;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(%I,0) FROM public.usage_credits WHERE user_id = $1 AND environment = $2 FOR UPDATE', credit_col)
    INTO credit_balance USING _user_id, _env;

  IF credit_balance < _amount THEN
    result := jsonb_build_object('allowed', false, 'reason', 'no_credits', 'tier', tier,
      'allowance', allowance, 'used', used_now, 'credits', credit_balance);
    PERFORM public.record_security_event('entitlement_check', 'consume', 'denied', _user_id,
      _feature, _env, 'no_credits', 'consume_entitlement', result);
    RETURN result;
  END IF;

  EXECUTE format(
    'UPDATE public.usage_credits SET %I = %I - $3 WHERE user_id = $1 AND environment = $2', credit_col, credit_col)
    USING _user_id, _env, _amount;

  UPDATE public.feature_usage SET used = used + _amount, credits_used = credits_used + _amount
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;

  result := jsonb_build_object('allowed', true, 'source', 'credits', 'tier', tier,
    'allowance', allowance, 'used', used_now + _amount, 'credits', credit_balance - _amount);
  PERFORM public.record_security_event('entitlement_check', 'consume', 'allowed', _user_id,
    _feature, _env, 'credit_pack', 'consume_entitlement', result);
  RETURN result;
END $function$;