-- Restrict affiliate_settings direct reads to admins only.
DROP POLICY IF EXISTS "settings readable by admins and active affiliates" ON public.affiliate_settings;
CREATE POLICY "settings readable by admins only"
ON public.affiliate_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Cached company research is written and read only by the backend function.
DROP POLICY IF EXISTS "Authenticated users can read cached research" ON public.company_research;
REVOKE SELECT ON public.company_research FROM authenticated;
CREATE POLICY "Admins can read cached research"
ON public.company_research FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.company_research TO authenticated;