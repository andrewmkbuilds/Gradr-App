REVOKE ALL ON FUNCTION public.audit_user_preferences_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_user_preferences_write() TO service_role;