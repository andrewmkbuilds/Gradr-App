ALTER TABLE public.security_audit_log DROP CONSTRAINT IF EXISTS security_audit_log_category_check;
ALTER TABLE public.security_audit_log ADD CONSTRAINT security_audit_log_category_check
  CHECK (category IN ('billing_webhook','entitlement_check','ai_authorization','eligibility','discount','admin_access'));

CREATE OR REPLACE FUNCTION public.log_admin_access_denied(_route text, _reason text DEFAULT 'not_admin')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  safe_route text := left(coalesce(_route, ''), 240);
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  -- Never let a client spam the audit trail: one row per user/route per minute.
  IF EXISTS (
    SELECT 1 FROM public.security_audit_log
    WHERE user_id = uid
      AND category = 'admin_access'
      AND event = safe_route
      AND created_at > now() - interval '1 minute'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.security_audit_log
    (category, event, decision, user_id, reason, source, details)
  VALUES (
    'admin_access',
    safe_route,
    'denied',
    uid,
    left(coalesce(_reason, 'not_admin'), 120),
    'client_route_guard',
    jsonb_build_object('route', safe_route, 'attempted_at', now())
  );
END $function$;

REVOKE ALL ON FUNCTION public.log_admin_access_denied(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_access_denied(text, text) TO authenticated, service_role;