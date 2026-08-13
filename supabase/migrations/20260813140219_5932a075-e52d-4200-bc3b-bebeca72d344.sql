DROP POLICY IF EXISTS "Admins read all verification requests" ON public.verification_requests;
CREATE POLICY "Admins read all verification requests"
  ON public.verification_requests FOR SELECT TO authenticated
  USING (public.is_anonymous_session() = false AND public.is_admin());

CREATE OR REPLACE FUNCTION public.assert_not_anonymous()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.is_anonymous_session() THEN
    RAISE EXCEPTION 'Guest sessions are not permitted to call this function'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_not_anonymous() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_not_anonymous() TO authenticated, service_role;