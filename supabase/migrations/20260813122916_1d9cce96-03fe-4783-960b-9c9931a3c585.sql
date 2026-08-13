CREATE TABLE public.csp_violation_reports (
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

CREATE INDEX csp_violation_reports_created_at_idx ON public.csp_violation_reports (created_at DESC);
CREATE INDEX csp_violation_reports_directive_idx ON public.csp_violation_reports (effective_directive, blocked_origin);

GRANT ALL ON public.csp_violation_reports TO service_role;

ALTER TABLE public.csp_violation_reports ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated grants or policies: reports are written and read only by
-- the server-side handler using the service role.
COMMENT ON TABLE public.csp_violation_reports IS 'CSP report-only violation reports ingested from browsers; service-role access only.';