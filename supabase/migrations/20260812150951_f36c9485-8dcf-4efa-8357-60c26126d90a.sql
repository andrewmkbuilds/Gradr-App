-- These functions are never called from the browser: they run from trusted
-- server code (edge functions / admin tooling) only. Removing client EXECUTE
-- keeps SECURITY DEFINER surface as small as possible.
REVOKE EXECUTE ON FUNCTION public.admin_affiliate_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_overview() TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_legal_pending_users(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_legal_pending_users(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.best_discount_for(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.best_discount_for(uuid, text, text) TO service_role;