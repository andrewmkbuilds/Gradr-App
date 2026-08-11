-- Remove blanket PUBLIC execute on all SECURITY DEFINER functions in public schema
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- Referral attribution requires an authenticated user; anon must not call it
REVOKE EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) TO authenticated;

-- Public referral-link validation + public program terms stay reachable for visitors
GRANT EXECUTE ON FUNCTION public.lookup_affiliate_by_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_public_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) TO anon, authenticated;

-- Admin-gated functions: signed-in only (each re-checks has_role internally)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit_actors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) TO authenticated;

-- Internal-only helpers: service_role / trigger context only
REVOKE EXECUTE ON FUNCTION public.assert_admin_write_rate_limit(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_affiliate_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_conversion_commission(uuid, numeric, public.affiliate_conversion_type, text) FROM anon, authenticated;
