ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS job_matches_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS job_matches_in_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS application_reminders_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS application_reminders_in_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_insights_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_insights_in_app boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.email_category_allowed(_email text, _category text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  allowed boolean;
BEGIN
  IF _email IS NULL OR _category IS NULL OR _category = 'essential' THEN
    RETURN true;
  END IF;

  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF uid IS NULL THEN
    RETURN true;
  END IF;

  SELECT CASE _category
           WHEN 'job_matches' THEN job_matches_email
           WHEN 'application_reminders' THEN application_reminders_email
           WHEN 'product_insights' THEN product_insights_email
           ELSE true
         END
    INTO allowed
    FROM public.notification_preferences
   WHERE user_id = uid;

  RETURN coalesce(allowed, true);
END;
$$;

REVOKE ALL ON FUNCTION public.email_category_allowed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_category_allowed(text, text) TO service_role;