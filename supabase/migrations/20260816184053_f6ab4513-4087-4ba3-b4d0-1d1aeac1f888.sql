DROP POLICY IF EXISTS "Admins read webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Admins read webhook deliveries"
  ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false AND public.is_admin());
REVOKE ALL ON public.webhook_deliveries FROM anon;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS industries text[],
  ADD COLUMN IF NOT EXISTS job_types text[],
  ADD COLUMN IF NOT EXISTS salary_max integer,
  ADD COLUMN IF NOT EXISTS target_roles text[],
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

ALTER TABLE public.tracked_jobs
  ADD COLUMN IF NOT EXISTS follow_up_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS follow_up_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_touch_at timestamptz;

CREATE TABLE IF NOT EXISTS public.career_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  summary text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS career_plans_user_created_idx ON public.career_plans (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_plans TO authenticated;
GRANT ALL ON public.career_plans TO service_role;
ALTER TABLE public.career_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "career_plans_owner_select" ON public.career_plans;
CREATE POLICY "career_plans_owner_select" ON public.career_plans FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
DROP POLICY IF EXISTS "career_plans_owner_insert" ON public.career_plans;
CREATE POLICY "career_plans_owner_insert" ON public.career_plans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
DROP POLICY IF EXISTS "career_plans_owner_update" ON public.career_plans;
CREATE POLICY "career_plans_owner_update" ON public.career_plans FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
DROP POLICY IF EXISTS "career_plans_owner_delete" ON public.career_plans;
CREATE POLICY "career_plans_owner_delete" ON public.career_plans FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE TRIGGER career_plans_set_updated_at
  BEFORE UPDATE ON public.career_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS signature_verified boolean,
  ADD COLUMN IF NOT EXISTS replay_of uuid REFERENCES public.webhook_deliveries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replays integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE public.api_health_alerts
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_error text;

DROP POLICY IF EXISTS "validated click inserts" ON public.affiliate_clicks;
REVOKE INSERT, UPDATE, DELETE ON public.affiliate_clicks FROM anon, authenticated;
REVOKE ALL ON public.affiliate_clicks FROM anon;
GRANT SELECT ON public.affiliate_clicks TO authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;
REVOKE EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "signed in can read jobs" ON public.discovered_jobs;
REVOKE ALL ON public.discovered_jobs FROM anon, authenticated;
GRANT ALL ON public.discovered_jobs TO service_role;

DROP POLICY IF EXISTS "tiers readable by authenticated" ON public.affiliate_tiers;
DROP POLICY IF EXISTS "active tiers readable by members" ON public.affiliate_tiers;
CREATE POLICY "active tiers readable by members" ON public.affiliate_tiers
  FOR SELECT TO authenticated USING (active AND public.is_anonymous_session() = false);
DROP POLICY IF EXISTS "admins read all tiers" ON public.affiliate_tiers;
CREATE POLICY "admins read all tiers" ON public.affiliate_tiers
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.email_idempotency (
  idempotency_key text PRIMARY KEY,
  message_id text NOT NULL,
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_idempotency TO service_role;
GRANT SELECT ON public.email_idempotency TO authenticated;
ALTER TABLE public.email_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read email idempotency" ON public.email_idempotency
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  template_name text,
  recipient_email text,
  event_type text NOT NULL CHECK (event_type IN ('queued','sent','delivered','opened','clicked','bounced','complained','failed','suppressed','deduped')),
  url text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_events_message_id_idx ON public.email_events (message_id);
CREATE INDEX IF NOT EXISTS email_events_created_at_idx ON public.email_events (created_at DESC);
CREATE INDEX IF NOT EXISTS email_events_type_idx ON public.email_events (event_type);
CREATE UNIQUE INDEX IF NOT EXISTS email_events_terminal_unique
  ON public.email_events (message_id, event_type)
  WHERE event_type IN ('queued','sent','delivered','bounced','complained','deduped');
GRANT ALL ON public.email_events TO service_role;
GRANT SELECT ON public.email_events TO authenticated;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read email events" ON public.email_events
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.email_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_feature_flags TO service_role;
GRANT SELECT, UPDATE ON public.email_feature_flags TO authenticated;
ALTER TABLE public.email_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read email flags" ON public.email_feature_flags
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update email flags" ON public.email_feature_flags
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
INSERT INTO public.email_feature_flags (key, enabled, description) VALUES
  ('plain_text_fallback', false, 'Attach a generated plain-text alternative part to every transactional email'),
  ('open_tracking', true, 'Embed a 1x1 pixel to record email opens'),
  ('click_tracking', true, 'Rewrite CTA links through the click-tracking redirect')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.email_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  observed numeric NOT NULL,
  baseline numeric,
  threshold numeric NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  notified_at timestamptz,
  notify_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric, window_start)
);
GRANT SELECT ON public.email_anomalies TO authenticated;
GRANT ALL ON public.email_anomalies TO service_role;
ALTER TABLE public.email_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read email anomalies" ON public.email_anomalies
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS email_anomalies_created_idx ON public.email_anomalies (created_at DESC);

CREATE TABLE IF NOT EXISTS public.endpoint_policy_overrides (
  endpoint text PRIMARY KEY,
  rate_limit integer,
  window_ms integer,
  backoff_seconds integer,
  max_backoff_seconds integer,
  disabled boolean NOT NULL DEFAULT false,
  alert_server_error integer,
  alert_rate_limited integer,
  alert_auth_rejected integer,
  alert_client_error integer,
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.endpoint_policy_overrides TO authenticated;
GRANT ALL ON public.endpoint_policy_overrides TO service_role;
ALTER TABLE public.endpoint_policy_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read endpoint overrides" ON public.endpoint_policy_overrides
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

UPDATE public.affiliate_settings SET affiliate_terms = replace(affiliate_terms, 'CareerFlow OS', 'Gradr') WHERE affiliate_terms ILIKE '%CareerFlow OS%';
ALTER TABLE public.affiliate_settings ALTER COLUMN affiliate_terms SET DEFAULT 'Standard affiliate terms apply. No self-referrals, spam, or misleading promotion. Gradr may revoke affiliate status at any time for policy violations.';

CREATE TABLE IF NOT EXISTS public.auth_email_link_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT,
  message_id UUID,
  action_type TEXT NOT NULL,
  template_key TEXT,
  recipient_redacted TEXT,
  link_origin TEXT,
  link_path TEXT,
  link_type TEXT,
  redirect_to TEXT,
  token_param TEXT,
  token_digest TEXT,
  url_digest TEXT,
  link_valid BOOLEAN NOT NULL DEFAULT TRUE,
  allowlist_ok boolean NOT NULL DEFAULT true,
  allowlist_reasons text[] NOT NULL DEFAULT '{}',
  redirect_sanitized boolean NOT NULL DEFAULT false,
  blocked boolean NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_email_link_audit_created_at_idx ON public.auth_email_link_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS auth_email_link_audit_message_id_idx ON public.auth_email_link_audit (message_id);
CREATE INDEX IF NOT EXISTS auth_email_link_audit_allowlist_idx ON public.auth_email_link_audit (allowlist_ok, created_at DESC);
GRANT SELECT ON public.auth_email_link_audit TO authenticated;
GRANT ALL ON public.auth_email_link_audit TO service_role;
ALTER TABLE public.auth_email_link_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read auth email link audit" ON public.auth_email_link_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.email_auth_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  domain text NOT NULL,
  sending_domain text,
  spf_ok boolean NOT NULL DEFAULT false,
  spf_record text,
  dkim_ok boolean NOT NULL DEFAULT false,
  dkim_selectors jsonb NOT NULL DEFAULT '[]'::jsonb,
  dmarc_ok boolean NOT NULL DEFAULT false,
  dmarc_record text,
  dmarc_policy text,
  test_message_id text,
  test_send_ok boolean NOT NULL DEFAULT false,
  headers_verified boolean NOT NULL DEFAULT false,
  auth_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall text NOT NULL DEFAULT 'unknown',
  duration_ms integer
);
CREATE INDEX IF NOT EXISTS email_auth_checks_created_idx ON public.email_auth_checks (created_at DESC);
GRANT ALL ON public.email_auth_checks TO service_role;
GRANT SELECT ON public.email_auth_checks TO authenticated;
ALTER TABLE public.email_auth_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read email auth checks" ON public.email_auth_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.dmarc_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_name text NOT NULL,
  org_email text,
  external_report_id text NOT NULL,
  date_begin timestamptz NOT NULL,
  date_end timestamptz NOT NULL,
  policy_domain text NOT NULL,
  policy_p text,
  policy_sp text,
  policy_pct integer,
  policy_adkim text,
  policy_aspf text,
  total_messages integer NOT NULL DEFAULT 0,
  pass_messages integer NOT NULL DEFAULT 0,
  fail_messages integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'upload',
  UNIQUE (org_name, external_report_id)
);
CREATE INDEX IF NOT EXISTS dmarc_reports_range_idx ON public.dmarc_reports (date_begin DESC);
GRANT ALL ON public.dmarc_reports TO service_role;
GRANT SELECT ON public.dmarc_reports TO authenticated;
ALTER TABLE public.dmarc_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read dmarc reports" ON public.dmarc_reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.dmarc_report_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dmarc_reports(id) ON DELETE CASCADE,
  source_ip text NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  disposition text,
  dkim_result text,
  spf_result text,
  header_from text,
  envelope_from text,
  dkim_domain text,
  dkim_selector text,
  spf_domain text,
  aligned boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS dmarc_report_records_report_idx ON public.dmarc_report_records (report_id);
GRANT ALL ON public.dmarc_report_records TO service_role;
GRANT SELECT ON public.dmarc_report_records TO authenticated;
ALTER TABLE public.dmarc_report_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read dmarc report records" ON public.dmarc_report_records
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.oauth_signin_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text NOT NULL,
  provider text NOT NULL DEFAULT 'google',
  stage text NOT NULL DEFAULT 'complete',
  user_id uuid,
  account_kind text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  start_url text,
  expected_redirect_uri text,
  final_url text,
  final_domain text,
  hops jsonb NOT NULL DEFAULT '[]'::jsonb,
  state_present boolean NOT NULL DEFAULT false,
  state_valid boolean,
  nonce_present boolean NOT NULL DEFAULT false,
  nonce_valid boolean,
  outcome text NOT NULL DEFAULT 'unknown',
  deviation boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  user_agent text,
  ip_hash text
);
CREATE INDEX IF NOT EXISTS oauth_signin_traces_created_idx ON public.oauth_signin_traces (created_at DESC);
CREATE INDEX IF NOT EXISTS oauth_signin_traces_request_idx ON public.oauth_signin_traces (request_id);
GRANT SELECT ON public.oauth_signin_traces TO authenticated;
GRANT ALL ON public.oauth_signin_traces TO service_role;
ALTER TABLE public.oauth_signin_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read oauth traces" ON public.oauth_signin_traces
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.oauth_flow_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  run_id text NOT NULL,
  account_label text NOT NULL,
  source text NOT NULL DEFAULT 'ci',
  status text NOT NULL DEFAULT 'pass',
  redirect_uri text,
  final_url text,
  final_domain text,
  expected_final_url text,
  duration_ms integer,
  hops jsonb NOT NULL DEFAULT '[]'::jsonb,
  header_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  console_errors jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS oauth_flow_checks_created_idx ON public.oauth_flow_checks (created_at DESC);
GRANT SELECT ON public.oauth_flow_checks TO authenticated;
GRANT ALL ON public.oauth_flow_checks TO service_role;
ALTER TABLE public.oauth_flow_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read oauth flow checks" ON public.oauth_flow_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.oauth_header_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  run_id text NOT NULL,
  source text NOT NULL DEFAULT 'admin',
  path text NOT NULL,
  url text NOT NULL,
  status integer,
  ok boolean NOT NULL DEFAULT false,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  problems jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS oauth_header_checks_created_idx ON public.oauth_header_checks (created_at DESC);
GRANT SELECT ON public.oauth_header_checks TO authenticated;
GRANT ALL ON public.oauth_header_checks TO service_role;
ALTER TABLE public.oauth_header_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read oauth header checks" ON public.oauth_header_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.csp_violation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  document_uri text,
  document_path text,
  referrer text,
  violated_directive text,
  effective_directive text,
  blocked_uri text,
  blocked_origin text,
  source_file text,
  line_number integer,
  column_number integer,
  status_code integer,
  disposition text,
  script_sample text,
  user_agent text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS csp_violation_reports_created_at_idx ON public.csp_violation_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS csp_violation_reports_directive_idx ON public.csp_violation_reports (effective_directive, blocked_origin);
GRANT ALL ON public.csp_violation_reports TO service_role;
GRANT SELECT ON public.csp_violation_reports TO authenticated;
ALTER TABLE public.csp_violation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read csp violation reports" ON public.csp_violation_reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.csp_alert_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('spike','new-combo','readiness')),
  directive text,
  blocked_origin text,
  headline text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurrences integer NOT NULL DEFAULT 1,
  first_alerted_at timestamptz NOT NULL DEFAULT now(),
  last_alerted_at timestamptz NOT NULL DEFAULT now(),
  delivery_error text
);
CREATE INDEX IF NOT EXISTS csp_alert_notices_last_alerted_idx ON public.csp_alert_notices (last_alerted_at DESC);
GRANT ALL ON public.csp_alert_notices TO service_role;
ALTER TABLE public.csp_alert_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read all verification requests" ON public.verification_requests;
CREATE POLICY "Admins read all verification requests"
  ON public.verification_requests FOR SELECT TO authenticated
  USING (public.is_anonymous_session() = false AND public.is_admin());

CREATE OR REPLACE FUNCTION public.assert_not_anonymous()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF public.is_anonymous_session() THEN
    RAISE EXCEPTION 'Guest sessions are not permitted to call this function' USING ERRCODE = '42501';
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.assert_not_anonymous() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_not_anonymous() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_legal_document(_document_id uuid, _user_agent text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  doc RECORD;
  rec_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.is_anonymous_session() THEN
    RAISE EXCEPTION 'Guest sessions cannot accept legal documents' USING ERRCODE = '42501';
  END IF;

  SELECT id, doc_type, version, status INTO doc
  FROM public.legal_documents WHERE id = _document_id;

  IF NOT FOUND OR doc.status <> 'published' THEN
    RAISE EXCEPTION 'Legal document is not available for acceptance';
  END IF;

  INSERT INTO public.legal_acceptances (user_id, document_id, doc_type, version, user_agent)
  VALUES (uid, doc.id, doc.doc_type, doc.version, left(COALESCE(_user_agent, ''), 300))
  ON CONFLICT (user_id, document_id) DO NOTHING
  RETURNING id INTO rec_id;

  IF rec_id IS NULL THEN
    SELECT id INTO rec_id FROM public.legal_acceptances
     WHERE user_id = uid AND document_id = doc.id;
  END IF;

  RETURN rec_id;
END $function$;

CREATE OR REPLACE FUNCTION public.attribute_signup_referral(_code text, _click_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  prof RECORD;
  existing UUID;
  ref_id UUID;
BEGIN
  IF uid IS NULL OR _code IS NULL OR length(_code) = 0 THEN RETURN NULL; END IF;
  IF public.is_anonymous_session() THEN RETURN NULL; END IF;

  SELECT id, user_id, status INTO prof FROM public.affiliate_profiles WHERE affiliate_code = _code;
  IF NOT FOUND OR prof.status <> 'active' THEN RETURN NULL; END IF;
  IF prof.user_id = uid THEN RETURN NULL; END IF;

  SELECT id INTO existing FROM public.affiliate_referrals WHERE referred_user_id = uid;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  INSERT INTO public.affiliate_referrals
    (affiliate_profile_id, referred_user_id, affiliate_click_id, referral_code,
     conversion_type, conversion_date, attribution_status)
  VALUES
    (prof.id, uid, _click_id, _code, 'signup', now(), 'confirmed')
  RETURNING id INTO ref_id;

  RETURN ref_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.accept_legal_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_document(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.fingerprint_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  origin text NOT NULL DEFAULT 'https://gradr.me',
  source text NOT NULL DEFAULT 'ci',
  commit_sha text,
  branch text,
  run_id text,
  run_url text,
  artifact_url text,
  signal_count integer NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'info',
  added jsonb NOT NULL DEFAULT '[]'::jsonb,
  removed jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed jsonb NOT NULL DEFAULT '[]'::jsonb,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fingerprint_snapshots_captured_idx ON public.fingerprint_snapshots (captured_at DESC);
GRANT SELECT ON public.fingerprint_snapshots TO authenticated;
GRANT ALL ON public.fingerprint_snapshots TO service_role;
ALTER TABLE public.fingerprint_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read fingerprint snapshots" ON public.fingerprint_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.security_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  triggered_by text NOT NULL DEFAULT 'cron',
  channels text[] NOT NULL DEFAULT '{}',
  dry_run boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_digest_runs_created_idx ON public.security_digest_runs (created_at DESC);
GRANT SELECT ON public.security_digest_runs TO authenticated;
GRANT ALL ON public.security_digest_runs TO service_role;
ALTER TABLE public.security_digest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read security digest runs" ON public.security_digest_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.security_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  finding_count integer NOT NULL DEFAULT 0,
  internal_ids text[] NOT NULL DEFAULT '{}',
  counts_by_level jsonb NOT NULL DEFAULT '{}'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  commit_sha text,
  commit_url text,
  branch text,
  pr_number integer,
  pr_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_scan_runs_scanned_at_idx ON public.security_scan_runs (scanned_at DESC);
GRANT SELECT ON public.security_scan_runs TO authenticated;
GRANT ALL ON public.security_scan_runs TO service_role;
ALTER TABLE public.security_scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read security scan runs" ON public.security_scan_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.permission_denied_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route text NOT NULL,
  authenticated boolean NOT NULL DEFAULT false,
  code text,
  relation text,
  message text,
  mentions_has_role boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permission_denied_signals_created_idx ON public.permission_denied_signals (created_at DESC);
GRANT SELECT ON public.permission_denied_signals TO authenticated;
GRANT ALL ON public.permission_denied_signals TO service_role;
ALTER TABLE public.permission_denied_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read permission denied signals" ON public.permission_denied_signals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));