CREATE OR REPLACE FUNCTION public.trg_audit_log_table_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  rec jsonb := to_jsonb(NEW);
  summary jsonb;
BEGIN
  summary := jsonb_strip_nulls(jsonb_build_object(
    'subject_user_id', rec->>'user_id',
    'status',          rec->>'status',
    'template',        rec->>'template',
    'recipient_domain', CASE
                          WHEN rec ? 'recipient' AND position('@' in COALESCE(rec->>'recipient','')) > 0
                          THEN split_part(rec->>'recipient', '@', 2)
                          ELSE NULL END,
    'jobs_count',      rec->>'jobs_count',
    'reminders_count', rec->>'reminders_count',
    'has_error',       CASE WHEN COALESCE(rec->>'error_message', rec->>'error') IS NOT NULL
                            THEN 'true' ELSE 'false' END,
    'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD)->>'status' ELSE NULL END
  ));

  INSERT INTO public.admin_audit_log
    (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (actor,
          CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
          TG_TABLE_NAME, (rec->>'id'), 1, summary);

  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.trg_audit_log_table_write() FROM PUBLIC, anon, authenticated;