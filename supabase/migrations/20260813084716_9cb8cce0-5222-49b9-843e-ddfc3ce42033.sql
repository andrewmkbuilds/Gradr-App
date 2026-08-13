-- 1. Affiliate click writes move fully server-side (service role only).
DROP POLICY IF EXISTS "validated click inserts" ON public.affiliate_clicks;
REVOKE INSERT, UPDATE, DELETE ON public.affiliate_clicks FROM anon, authenticated;
REVOKE ALL ON public.affiliate_clicks FROM anon;
GRANT SELECT ON public.affiliate_clicks TO authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;

-- 2. The click-validation helper is no longer reachable from the browser.
REVOKE EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) FROM PUBLIC, anon, authenticated;

-- 3. Guest (anonymous) sessions must not read verification requests.
DROP POLICY IF EXISTS "Admins read all verification requests" ON public.verification_requests;
CREATE POLICY "Admins read all verification requests"
  ON public.verification_requests
  FOR SELECT
  TO authenticated
  USING (public.is_admin());