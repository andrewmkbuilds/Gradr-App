-- 1. Internal email-queue + report helpers must be service-role only.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_category_allowed(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_email_delivery_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_email_weekly_report(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_email_weekly_report() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_category_allowed(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_email_weekly_report(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_email_weekly_report() TO service_role;

-- Admin dashboard calls this one from the browser; it enforces has_role(admin) itself.
REVOKE EXECUTE ON FUNCTION public.admin_email_weekly_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_email_weekly_report() TO authenticated, service_role;

-- 2. affiliate_clicks: clients may never insert; only the tracking edge function
--    (service_role) writes rows, and every row must pair a valid code with its profile.
REVOKE INSERT ON public.affiliate_clicks FROM anon, authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;

DROP POLICY IF EXISTS "clients cannot insert clicks" ON public.affiliate_clicks;
CREATE POLICY "clients cannot insert clicks"
  ON public.affiliate_clicks FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.affiliate_clicks_enforce_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.affiliate_profile_id IS NULL THEN
    RAISE EXCEPTION 'affiliate_profile_id is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.affiliate_profiles p
    WHERE p.id = NEW.affiliate_profile_id
      AND (NEW.affiliate_code IS NULL OR p.affiliate_code = NEW.affiliate_code)
  ) THEN
    RAISE EXCEPTION 'affiliate click code/profile mismatch';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.affiliate_clicks_enforce_ownership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS affiliate_clicks_enforce_ownership ON public.affiliate_clicks;
CREATE TRIGGER affiliate_clicks_enforce_ownership
  BEFORE INSERT OR UPDATE ON public.affiliate_clicks
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_clicks_enforce_ownership();