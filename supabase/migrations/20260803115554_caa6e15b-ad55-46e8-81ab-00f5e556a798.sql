-- 1. Lock down commission creation to trusted backend only
REVOKE EXECUTE ON FUNCTION public.record_conversion_commission(uuid, numeric, public.affiliate_conversion_type, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_conversion_commission(uuid, numeric, public.affiliate_conversion_type, text) TO service_role;

-- 2. Validation helper for affiliate click inserts (bypasses affiliate_profiles RLS safely, read-only)
CREATE OR REPLACE FUNCTION public.affiliate_click_is_valid(_profile_id uuid, _code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.affiliate_profiles p
    WHERE p.id = _profile_id
      AND p.affiliate_code = _code
      AND p.status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) TO anon, authenticated, service_role;

-- 3. Replace permissive affiliate_clicks INSERT policy
DROP POLICY IF EXISTS "anyone can insert clicks" ON public.affiliate_clicks;

CREATE POLICY "validated click inserts"
ON public.affiliate_clicks
FOR INSERT
TO anon, authenticated
WITH CHECK (
  affiliate_profile_id IS NOT NULL
  AND public.affiliate_click_is_valid(affiliate_profile_id, affiliate_code)
  AND ip_hash IS NULL
  AND length(coalesce(user_agent, '')) <= 500
  AND length(coalesce(landing_page, '')) <= 2048
  AND length(coalesce(affiliate_code, '')) <= 64
);

-- 4. Admin-only correction/removal of click data
CREATE POLICY "admins can update clicks"
ON public.affiliate_clicks
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete clicks"
ON public.affiliate_clicks
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Replace permissive analytics_events INSERT policy (no spoofed user_id)
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;

CREATE POLICY "insert own analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid())
  AND length(coalesce(event_name, '')) BETWEEN 1 AND 128
  AND length(coalesce(path, '')) <= 2048
  AND length(coalesce(referrer, '')) <= 2048
);