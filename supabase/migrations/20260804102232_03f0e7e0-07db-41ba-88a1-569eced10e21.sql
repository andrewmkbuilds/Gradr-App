
DROP POLICY IF EXISTS "settings readable by authenticated" ON public.affiliate_settings;

CREATE POLICY "settings readable by admins and active affiliates"
ON public.affiliate_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.affiliate_profiles ap
    WHERE ap.user_id = auth.uid() AND ap.status = 'active'
  )
);

CREATE OR REPLACE FUNCTION public.get_affiliate_public_settings()
RETURNS TABLE(
  program_enabled boolean,
  cookie_duration_days integer,
  default_commission_type public.affiliate_commission_type,
  default_commission_rate numeric,
  minimum_payout_threshold numeric,
  affiliate_terms text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.program_enabled, s.cookie_duration_days, s.default_commission_type,
         s.default_commission_rate, s.minimum_payout_threshold, s.affiliate_terms
  FROM public.affiliate_settings s
  WHERE s.id = 1;
$$;

REVOKE ALL ON FUNCTION public.get_affiliate_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_public_settings() TO anon, authenticated;
