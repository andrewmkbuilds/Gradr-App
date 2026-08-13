CREATE TABLE public.oauth_signin_traces (
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
CREATE INDEX oauth_signin_traces_created_idx ON public.oauth_signin_traces (created_at DESC);
CREATE INDEX oauth_signin_traces_request_idx ON public.oauth_signin_traces (request_id);

GRANT SELECT ON public.oauth_signin_traces TO authenticated;
GRANT ALL ON public.oauth_signin_traces TO service_role;
ALTER TABLE public.oauth_signin_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read oauth traces" ON public.oauth_signin_traces
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.oauth_flow_checks (
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
CREATE INDEX oauth_flow_checks_created_idx ON public.oauth_flow_checks (created_at DESC);

GRANT SELECT ON public.oauth_flow_checks TO authenticated;
GRANT ALL ON public.oauth_flow_checks TO service_role;
ALTER TABLE public.oauth_flow_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read oauth flow checks" ON public.oauth_flow_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.oauth_header_checks (
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
CREATE INDEX oauth_header_checks_created_idx ON public.oauth_header_checks (created_at DESC);

GRANT SELECT ON public.oauth_header_checks TO authenticated;
GRANT ALL ON public.oauth_header_checks TO service_role;
ALTER TABLE public.oauth_header_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read oauth header checks" ON public.oauth_header_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));