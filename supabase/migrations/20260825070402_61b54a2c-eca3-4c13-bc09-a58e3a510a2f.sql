CREATE TABLE IF NOT EXISTS public.email_template_classification (
  template_name text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('transactional', 'marketing')),
  category text NOT NULL,
  category_label text NOT NULL,
  group_label text NOT NULL,
  trigger_reason text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_template_classification TO authenticated;
GRANT ALL ON public.email_template_classification TO service_role;
ALTER TABLE public.email_template_classification ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins read email classification"
    ON public.email_template_classification FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.email_template_classification (template_name, kind, category, category_label, group_label, trigger_reason) VALUES
  ('welcome','transactional','essential','Essential','Account & security','Account created'),
  ('email-verification','transactional','essential','Essential','Account & security','Address needs confirming'),
  ('password-reset','transactional','essential','Essential','Account & security','Password reset requested'),
  ('sign-in-alert','transactional','essential','Essential','Account & security','Sign-in from a new device'),
  ('security-alert','transactional','essential','Essential','Account & security','Security event on the account'),
  ('student-verification-code','transactional','essential','Essential','Account & security','Student verification code requested'),
  ('subscription-started','transactional','essential','Essential','Billing','Subscription started'),
  ('subscription-upgraded','transactional','essential','Essential','Billing','Plan upgraded'),
  ('subscription-downgraded','transactional','essential','Essential','Billing','Plan downgraded'),
  ('subscription-cancelled','transactional','essential','Essential','Billing','Subscription cancelled'),
  ('payment-successful','transactional','essential','Essential','Billing','Payment taken'),
  ('payment-failed','transactional','essential','Essential','Billing','Payment declined'),
  ('payment-retry','transactional','essential','Essential','Billing','Payment retry scheduled'),
  ('payment-refunded','transactional','essential','Essential','Billing','Refund issued'),
  ('invoice-receipt','transactional','essential','Essential','Billing','Receipt for a charge'),
  ('verification-submitted','transactional','essential','Essential','Verification','Verification request received'),
  ('verification-approved','transactional','essential','Essential','Verification','Verification approved'),
  ('verification-rejected','transactional','essential','Essential','Verification','Verification rejected'),
  ('verification-needs-info','transactional','essential','Essential','Verification','Verification needs more information'),
  ('job-match','transactional','job_matches','Job matches','Product notifications','A saved search matched a new role'),
  ('application-followup','transactional','application_reminders','Application reminders','Product notifications','A scheduled follow-up is due'),
  ('resume-analysis','transactional','product_insights','Resume & interview insights','Product notifications','A resume finished analysis'),
  ('ats-score-update','transactional','product_insights','Resume & interview insights','Product notifications','An ATS score changed'),
  ('interview-completed','transactional','product_insights','Resume & interview insights','Product notifications','A mock interview finished'),
  ('interview-report','transactional','product_insights','Resume & interview insights','Product notifications','An interview report finished generating'),
  ('career-plan','transactional','product_insights','Resume & interview insights','Product notifications','A career plan is ready')
ON CONFLICT (template_name) DO UPDATE
  SET kind = EXCLUDED.kind, category = EXCLUDED.category, category_label = EXCLUDED.category_label,
      group_label = EXCLUDED.group_label, trigger_reason = EXCLUDED.trigger_reason, updated_at = now();

CREATE TABLE IF NOT EXISTS public.email_delivery_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL CHECK (event IN ('queued','sent','suppressed','failed','bounced','complained','dlq','dry_run')),
  template_name text NOT NULL,
  kind text,
  category text,
  category_label text,
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  message_id text,
  reason text,
  source text NOT NULL DEFAULT 'send_log',
  metadata jsonb
);
CREATE INDEX IF NOT EXISTS email_delivery_audit_occurred_idx ON public.email_delivery_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_delivery_audit_template_idx ON public.email_delivery_audit (template_name);
CREATE INDEX IF NOT EXISTS email_delivery_audit_event_idx ON public.email_delivery_audit (event);
GRANT SELECT ON public.email_delivery_audit TO authenticated;
GRANT ALL ON public.email_delivery_audit TO service_role;
ALTER TABLE public.email_delivery_audit ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins read email delivery audit"
    ON public.email_delivery_audit FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.trg_email_delivery_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cls public.email_template_classification%ROWTYPE;
  uid uuid;
  ev text;
BEGIN
  SELECT * INTO cls FROM public.email_template_classification WHERE template_name = NEW.template_name;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(NEW.recipient_email) LIMIT 1;
  ev := CASE WHEN NEW.status = 'pending' THEN 'queued' ELSE NEW.status END;
  INSERT INTO public.email_delivery_audit (
    occurred_at, event, template_name, kind, category, category_label,
    recipient_email, recipient_user_id, message_id, reason, source, metadata
  ) VALUES (
    coalesce(NEW.created_at, now()), ev, NEW.template_name, cls.kind, cls.category,
    coalesce(cls.category_label, 'Unclassified'), NEW.recipient_email, uid,
    NEW.message_id, NEW.error_message, 'send_log', NEW.metadata
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS email_send_log_audit ON public.email_send_log;
CREATE TRIGGER email_send_log_audit
AFTER INSERT ON public.email_send_log
FOR EACH ROW EXECUTE FUNCTION public.trg_email_delivery_audit();

CREATE TABLE IF NOT EXISTS public.email_weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_day date NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  report jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS email_weekly_reports_period_day_idx
  ON public.email_weekly_reports (period_day);
GRANT SELECT ON public.email_weekly_reports TO authenticated;
GRANT ALL ON public.email_weekly_reports TO service_role;
ALTER TABLE public.email_weekly_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins read weekly email reports"
    ON public.email_weekly_reports FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.build_email_weekly_report(_end timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH window_rows AS (
    SELECT * FROM public.email_delivery_audit
     WHERE occurred_at >= _end - interval '7 days' AND occurred_at < _end AND event <> 'dry_run'
  )
  SELECT jsonb_build_object(
    'period_start', _end - interval '7 days',
    'period_end', _end,
    'totals', jsonb_build_object(
      'queued', (SELECT count(*) FROM window_rows WHERE event = 'queued'),
      'sent', (SELECT count(*) FROM window_rows WHERE event = 'sent'),
      'suppressed', (SELECT count(*) FROM window_rows WHERE event = 'suppressed'),
      'failed', (SELECT count(*) FROM window_rows WHERE event IN ('failed','dlq','bounced','complained')),
      'recipients', (SELECT count(DISTINCT lower(recipient_email)) FROM window_rows)
    ),
    'by_template', coalesce((
      SELECT jsonb_agg(t ORDER BY (t->>'sent')::int DESC) FROM (
        SELECT jsonb_build_object(
          'template_name', template_name,
          'category_label', max(coalesce(category_label,'Unclassified')),
          'sent', count(*) FILTER (WHERE event = 'sent'),
          'queued', count(*) FILTER (WHERE event = 'queued'),
          'suppressed', count(*) FILTER (WHERE event = 'suppressed'),
          'failed', count(*) FILTER (WHERE event IN ('failed','dlq','bounced','complained'))
        ) AS t FROM window_rows GROUP BY template_name
      ) s
    ), '[]'::jsonb),
    'suppression_reasons', coalesce((
      SELECT jsonb_agg(jsonb_build_object('reason', reason, 'count', c) ORDER BY c DESC) FROM (
        SELECT coalesce(reason, 'Suppression list / unsubscribed') AS reason, count(*) AS c
          FROM window_rows WHERE event = 'suppressed' GROUP BY 1
      ) r
    ), '[]'::jsonb),
    'marketing_shaped', coalesce((
      SELECT jsonb_agg(jsonb_build_object('template_name', template_name, 'event', event, 'count', c) ORDER BY c DESC) FROM (
        SELECT w.template_name, w.event, count(*) AS c
          FROM window_rows w
          LEFT JOIN public.email_template_classification c ON c.template_name = w.template_name
         WHERE c.template_name IS NULL OR c.kind = 'marketing'
            OR w.template_name ~* '(digest|newsletter|campaign|promo|announcement|drip|roundup)'
         GROUP BY w.template_name, w.event
      ) m
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_email_weekly_report()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ends timestamptz := now();
  payload jsonb;
  new_id uuid;
BEGIN
  payload := public.build_email_weekly_report(ends);
  INSERT INTO public.email_weekly_reports (period_day, period_start, period_end, report)
  VALUES ((ends AT TIME ZONE 'UTC')::date, ends - interval '7 days', ends, payload)
  ON CONFLICT (period_day)
    DO UPDATE SET report = EXCLUDED.report, period_end = EXCLUDED.period_end,
                  period_start = EXCLUDED.period_start, generated_at = now()
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_email_weekly_report()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE stored public.email_weekly_reports%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  SELECT * INTO stored FROM public.email_weekly_reports ORDER BY period_end DESC LIMIT 1;
  RETURN jsonb_build_object(
    'live', public.build_email_weekly_report(now()),
    'snapshot', CASE WHEN stored.id IS NULL THEN NULL ELSE stored.report END,
    'snapshot_generated_at', stored.generated_at
  );
END; $$;

REVOKE ALL ON FUNCTION public.build_email_weekly_report(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_email_weekly_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_email_weekly_report() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_email_weekly_report() TO authenticated;

DO $$ BEGIN PERFORM cron.unschedule('email-weekly-report'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('email-weekly-report','0 6 * * 1', $CRON$ SELECT public.generate_email_weekly_report(); $CRON$);