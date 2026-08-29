REVOKE EXECUTE ON FUNCTION public.billing_period_start(uuid, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_period_start(uuid, text, timestamptz) TO service_role;