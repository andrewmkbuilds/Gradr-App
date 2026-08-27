-- Least privilege: revoke EXECUTE on SECURITY DEFINER routines that are never
-- called from a browser client (they run server-side via service_role or are
-- invoked internally by other definer functions).
REVOKE EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_analytics_regressions(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_review_verification_request(uuid, text, text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_affiliate_overview() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_legal_pending_users(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_rpc_guard(text, integer, interval) FROM anon, authenticated;
