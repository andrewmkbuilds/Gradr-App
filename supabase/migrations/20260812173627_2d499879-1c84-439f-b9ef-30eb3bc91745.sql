-- 1. usage_credits: exclude anonymous (guest) sessions
DROP POLICY IF EXISTS "own credits readable" ON public.usage_credits;

CREATE POLICY "own credits readable"
ON public.usage_credits
FOR SELECT
TO authenticated
USING (
  coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

-- 2. Revoke client EXECUTE on SECURITY DEFINER helpers that must not be
--    callable directly from the Data API. They remain callable from other
--    SECURITY DEFINER functions (which run as owner) and from edge functions
--    using the service role.
REVOKE ALL ON FUNCTION public.lookup_affiliate_by_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_affiliate_public_settings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lookup_affiliate_by_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_affiliate_public_settings() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;