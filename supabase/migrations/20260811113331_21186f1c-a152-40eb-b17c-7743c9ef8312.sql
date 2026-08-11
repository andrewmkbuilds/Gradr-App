CREATE OR REPLACE FUNCTION public.refund_entitlement(
  _user_id uuid, _feature text, _env text DEFAULT 'live', _amount integer DEFAULT 1
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  period date := date_trunc('month', now())::date;
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

  -- Only give a credit back if this charge actually spent one.
  IF row_credits >= _amount THEN
    credit_col := CASE _feature WHEN 'application' THEN 'application_credits'
                                WHEN 'interview' THEN 'interview_credits' ELSE NULL END;
    IF credit_col IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.usage_credits SET %I = %I + $3 WHERE user_id = $1 AND environment = $2',
        credit_col, credit_col) USING _user_id, _env, _amount;
    END IF;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.refund_entitlement(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_entitlement(uuid, text, text, integer) TO service_role;