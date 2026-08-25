-- =====================================================================
-- 1. Email pipeline failure alerts
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.email_pipeline_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  first_occurred_at timestamptz NOT NULL DEFAULT now(),
  last_occurred_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  stage text NOT NULL DEFAULT 'send',
  template_name text NOT NULL,
  category_label text,
  reason text,
  recipients text[] NOT NULL DEFAULT '{}',
  recipient_count integer NOT NULL DEFAULT 0,
  occurrence_count integer NOT NULL DEFAULT 1,
  resolved_at timestamptz,
  resolved_by uuid
);

GRANT SELECT ON public.email_pipeline_alerts TO authenticated;
GRANT ALL ON public.email_pipeline_alerts TO service_role;
ALTER TABLE public.email_pipeline_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins read email pipeline alerts"
    ON public.email_pipeline_alerts FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_pipeline_alerts_open_key
  ON public.email_pipeline_alerts (event, template_name, md5(coalesce(reason, '')))
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS email_pipeline_alerts_created_idx
  ON public.email_pipeline_alerts (created_at DESC);

CREATE OR REPLACE FUNCTION public.trg_email_pipeline_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  stage_label text;
  existing_id uuid;
  reason_text text;
BEGIN
  IF NEW.event NOT IN ('failed','dlq','bounced','complained','suppressed') THEN
    RETURN NEW;
  END IF;

  stage_label := CASE
    WHEN NEW.event = 'suppressed' THEN 'enqueue'
    WHEN NEW.event = 'dlq' THEN 'dead_letter'
    ELSE 'send'
  END;

  reason_text := coalesce(
    NEW.reason,
    CASE WHEN NEW.event = 'suppressed' THEN 'Recipient suppressed (bounce, complaint or unsubscribe)'
         ELSE 'No reason reported by the delivery pipeline' END
  );

  SELECT id INTO existing_id
    FROM public.email_pipeline_alerts
   WHERE resolved_at IS NULL
     AND event = NEW.event
     AND template_name = NEW.template_name
     AND md5(coalesce(reason, '')) = md5(reason_text)
   LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.email_pipeline_alerts a
       SET occurrence_count = a.occurrence_count + 1,
           last_occurred_at = NEW.occurred_at,
           updated_at = now(),
           category_label = coalesce(NEW.category_label, a.category_label),
           recipients = (
             SELECT array_agg(DISTINCT r) FROM unnest(
               (a.recipients || ARRAY[lower(NEW.recipient_email)])[1:50]
             ) r
           )
     WHERE a.id = existing_id;

    UPDATE public.email_pipeline_alerts a
       SET recipient_count = coalesce(array_length(a.recipients, 1), 0)
     WHERE a.id = existing_id;
  ELSE
    INSERT INTO public.email_pipeline_alerts (
      event, stage, template_name, category_label, reason,
      recipients, recipient_count, first_occurred_at, last_occurred_at
    ) VALUES (
      NEW.event, stage_label, NEW.template_name,
      coalesce(NEW.category_label, 'Unclassified'), reason_text,
      ARRAY[lower(NEW.recipient_email)], 1, NEW.occurred_at, NEW.occurred_at
    );

    PERFORM public.notify_admins(
      'email_pipeline_failure',
      'Email delivery problem: ' || NEW.template_name,
      NEW.event || ' — ' || reason_text || ' (first affected: ' || NEW.recipient_email || ')',
      '/admin/email-audit',
      jsonb_build_object(
        'template_name', NEW.template_name,
        'event', NEW.event,
        'stage', stage_label,
        'reason', reason_text,
        'recipient', NEW.recipient_email
      )
    );
  END IF;

  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.trg_email_pipeline_alert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS email_delivery_audit_alert ON public.email_delivery_audit;
CREATE TRIGGER email_delivery_audit_alert
AFTER INSERT ON public.email_delivery_audit
FOR EACH ROW EXECUTE FUNCTION public.trg_email_pipeline_alert();

CREATE OR REPLACE FUNCTION public.admin_resolve_email_alert(_alert_id uuid)
RETURNS public.email_pipeline_alerts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.email_pipeline_alerts;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  UPDATE public.email_pipeline_alerts
     SET resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
   WHERE id = _alert_id AND resolved_at IS NULL
  RETURNING * INTO row;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Alert not found or already resolved';
  END IF;
  RETURN row;
END; $$;

REVOKE ALL ON FUNCTION public.admin_resolve_email_alert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_email_alert(uuid) TO authenticated, service_role;

-- =====================================================================
-- 2. Admin-configurable retention policy
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.email_retention_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  audit_retention_days integer NOT NULL DEFAULT 180,
  report_retention_days integer NOT NULL DEFAULT 365,
  alert_retention_days integer NOT NULL DEFAULT 90,
  purge_enabled boolean NOT NULL DEFAULT true,
  last_purge_at timestamptz,
  last_purge_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.email_retention_settings TO authenticated;
GRANT ALL ON public.email_retention_settings TO service_role;
ALTER TABLE public.email_retention_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins read email retention settings"
    ON public.email_retention_settings FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.email_retention_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS email_retention_settings_updated_at ON public.email_retention_settings;
CREATE TRIGGER email_retention_settings_updated_at
BEFORE UPDATE ON public.email_retention_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.admin_email_retention_settings()
RETURNS public.email_retention_settings
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.email_retention_settings;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  SELECT * INTO row FROM public.email_retention_settings WHERE id;
  RETURN row;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_email_retention(
  _audit_retention_days integer,
  _report_retention_days integer,
  _alert_retention_days integer,
  _purge_enabled boolean
) RETURNS public.email_retention_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.email_retention_settings;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  IF _audit_retention_days < 7 OR _audit_retention_days > 3650
     OR _report_retention_days < 7 OR _report_retention_days > 3650
     OR _alert_retention_days < 7 OR _alert_retention_days > 3650 THEN
    RAISE EXCEPTION 'Retention windows must be between 7 and 3650 days';
  END IF;

  UPDATE public.email_retention_settings
     SET audit_retention_days = _audit_retention_days,
         report_retention_days = _report_retention_days,
         alert_retention_days = _alert_retention_days,
         purge_enabled = _purge_enabled,
         updated_by = auth.uid()
   WHERE id
  RETURNING * INTO row;
  RETURN row;
END; $$;

CREATE OR REPLACE FUNCTION public.purge_email_retention()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.email_retention_settings;
  audit_deleted integer := 0;
  reports_deleted integer := 0;
  alerts_deleted integer := 0;
  result jsonb;
BEGIN
  SELECT * INTO cfg FROM public.email_retention_settings WHERE id;
  IF cfg.id IS NULL OR NOT cfg.purge_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'purge disabled');
  END IF;

  DELETE FROM public.email_delivery_audit
   WHERE occurred_at < now() - make_interval(days => cfg.audit_retention_days);
  GET DIAGNOSTICS audit_deleted = ROW_COUNT;

  DELETE FROM public.email_weekly_reports
   WHERE period_end < now() - make_interval(days => cfg.report_retention_days);
  GET DIAGNOSTICS reports_deleted = ROW_COUNT;

  DELETE FROM public.email_pipeline_alerts
   WHERE resolved_at IS NOT NULL
     AND resolved_at < now() - make_interval(days => cfg.alert_retention_days);
  GET DIAGNOSTICS alerts_deleted = ROW_COUNT;

  result := jsonb_build_object(
    'ran_at', now(),
    'audit_deleted', audit_deleted,
    'reports_deleted', reports_deleted,
    'alerts_deleted', alerts_deleted,
    'audit_retention_days', cfg.audit_retention_days,
    'report_retention_days', cfg.report_retention_days,
    'alert_retention_days', cfg.alert_retention_days
  );

  UPDATE public.email_retention_settings
     SET last_purge_at = now(), last_purge_result = result
   WHERE id;

  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_run_email_retention_purge()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  RETURN public.purge_email_retention();
END; $$;

REVOKE ALL ON FUNCTION public.purge_email_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_email_retention() TO service_role;

REVOKE ALL ON FUNCTION public.admin_email_retention_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_email_retention_settings() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_email_retention(integer, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_email_retention(integer, integer, integer, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_run_email_retention_purge() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_run_email_retention_purge() TO authenticated, service_role;

DO $$ BEGIN PERFORM cron.unschedule('email-retention-purge'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('email-retention-purge', '30 3 * * *', $CRON$ SELECT public.purge_email_retention(); $CRON$);