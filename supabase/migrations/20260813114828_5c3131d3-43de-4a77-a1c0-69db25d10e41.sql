CREATE TABLE public.email_auth_checks (
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

CREATE INDEX email_auth_checks_created_idx ON public.email_auth_checks (created_at DESC);

GRANT ALL ON public.email_auth_checks TO service_role;
ALTER TABLE public.email_auth_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read email auth checks"
  ON public.email_auth_checks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.dmarc_reports (
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

CREATE INDEX dmarc_reports_range_idx ON public.dmarc_reports (date_begin DESC);

GRANT ALL ON public.dmarc_reports TO service_role;
ALTER TABLE public.dmarc_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read dmarc reports"
  ON public.dmarc_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.dmarc_report_records (
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

CREATE INDEX dmarc_report_records_report_idx ON public.dmarc_report_records (report_id);

GRANT ALL ON public.dmarc_report_records TO service_role;
ALTER TABLE public.dmarc_report_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read dmarc report records"
  ON public.dmarc_report_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));