REVOKE EXECUTE ON FUNCTION public.notification_channels(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_channels(uuid, text) TO service_role;