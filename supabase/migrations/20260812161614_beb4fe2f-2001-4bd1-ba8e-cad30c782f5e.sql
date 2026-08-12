-- Allow a data_access category in the security audit log
ALTER TABLE public.security_audit_log DROP CONSTRAINT IF EXISTS security_audit_log_category_check;
ALTER TABLE public.security_audit_log ADD CONSTRAINT security_audit_log_category_check
  CHECK (category IN ('billing_webhook','entitlement_check','ai_authorization','eligibility','discount','admin_access','data_access'));

-- Helper: is the current session an anonymous (guest) session?
CREATE OR REPLACE FUNCTION public.is_anonymous_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false)
$function$;

REVOKE ALL ON FUNCTION public.is_anonymous_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_anonymous_session() TO authenticated, service_role;

-- Write auditing: every INSERT/UPDATE/DELETE on user_preferences
CREATE OR REPLACE FUNCTION public.audit_user_preferences_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  row_user uuid := COALESCE(NEW.user_id, OLD.user_id);
  anon boolean := COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false);
BEGIN
  INSERT INTO public.security_audit_log
    (category, event, decision, user_id, source, reason, details)
  VALUES (
    'data_access',
    'user_preferences_' || lower(TG_OP),
    'allowed',
    row_user,
    'rls_trigger',
    CASE WHEN anon THEN 'anonymous_session' ELSE 'authenticated_session' END,
    jsonb_build_object(
      'table', 'user_preferences',
      'operation', TG_OP,
      'is_anonymous', anon,
      'actor_id', auth.uid(),
      'row_user_id', row_user,
      'role', current_setting('role', true)
    )
  );
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS audit_user_preferences_write ON public.user_preferences;
CREATE TRIGGER audit_user_preferences_write
AFTER INSERT OR UPDATE OR DELETE ON public.user_preferences
FOR EACH ROW EXECUTE FUNCTION public.audit_user_preferences_write();

-- Read auditing: called by the client after (or when denied) reading preferences.
-- Deduped to one row per user per 15 minutes to keep the log small.
CREATE OR REPLACE FUNCTION public.log_user_preferences_read(
  _source text DEFAULT 'app',
  _found boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  anon boolean := COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false);
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.security_audit_log
     WHERE category = 'data_access'
       AND event = 'user_preferences_select'
       AND user_id = uid
       AND source = left(COALESCE(_source, 'app'), 60)
       AND created_at > now() - interval '15 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.security_audit_log
    (category, event, decision, user_id, source, reason, details)
  VALUES (
    'data_access',
    'user_preferences_select',
    CASE WHEN anon THEN 'denied' ELSE 'allowed' END,
    uid,
    left(COALESCE(_source, 'app'), 60),
    CASE WHEN anon THEN 'anonymous_session' ELSE 'authenticated_session' END,
    jsonb_build_object(
      'table', 'user_preferences',
      'operation', 'SELECT',
      'is_anonymous', anon,
      'actor_id', uid,
      'row_found', COALESCE(_found, false)
    )
  );
END $function$;

REVOKE ALL ON FUNCTION public.log_user_preferences_read(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_user_preferences_read(text, boolean) TO authenticated, service_role;