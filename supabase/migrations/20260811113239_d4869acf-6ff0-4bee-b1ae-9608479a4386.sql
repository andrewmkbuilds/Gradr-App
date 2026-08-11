CREATE OR REPLACE FUNCTION public.current_plan_tier(_user_id uuid, _env text DEFAULT 'live')
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s RECORD;
BEGIN
  SELECT subscription_status, subscription_tier, current_period_end
    INTO s
    FROM public.subscribers
   WHERE user_id = _user_id AND environment = _env
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  IF NOT FOUND OR s.subscription_tier IS NULL THEN
    RETURN 'free';
  END IF;

  -- Access survives dunning (past_due) and lasts until period end after cancel/pause.
  IF s.subscription_status IN ('active','trialing','past_due')
     AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN
    RETURN lower(s.subscription_tier);
  END IF;

  IF s.subscription_status IN ('canceled','paused')
     AND s.current_period_end IS NOT NULL AND s.current_period_end > now() THEN
    RETURN lower(s.subscription_tier);
  END IF;

  RETURN 'free';
END $$;

REVOKE ALL ON FUNCTION public.current_plan_tier(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_plan_tier(uuid, text) TO service_role;