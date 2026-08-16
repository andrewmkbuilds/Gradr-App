CREATE TABLE IF NOT EXISTS public.oauth_flow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  user_id uuid,
  provider text NOT NULL DEFAULT 'google',
  account_type text NOT NULL DEFAULT 'unknown',
  stage text NOT NULL,
  hop_index integer NOT NULL DEFAULT 0,
  source_url text,
  destination_url text,
  final_url text,
  state_result text NOT NULL DEFAULT 'not_applicable',
  nonce_result text NOT NULL DEFAULT 'not_applicable',
  deviation boolean NOT NULL DEFAULT false,
  deviation_type text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_flow_events_created_idx ON public.oauth_flow_events (created_at DESC);
CREATE INDEX IF NOT EXISTS oauth_flow_events_request_idx ON public.oauth_flow_events (request_id);
GRANT SELECT, INSERT ON public.oauth_flow_events TO authenticated;
GRANT INSERT ON public.oauth_flow_events TO anon;
GRANT ALL ON public.oauth_flow_events TO service_role;
ALTER TABLE public.oauth_flow_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can record their own sign-in hops" ON public.oauth_flow_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "Admins read oauth flow events" ON public.oauth_flow_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.analytics_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  event_name text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  window_start timestamptz NOT NULL DEFAULT now(),
  window_end timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_alerts_created_idx ON public.analytics_alerts (created_at DESC);
GRANT SELECT, UPDATE ON public.analytics_alerts TO authenticated;
GRANT ALL ON public.analytics_alerts TO service_role;
ALTER TABLE public.analytics_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read analytics alerts" ON public.analytics_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins resolve analytics alerts" ON public.analytics_alerts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text,
  event_type text,
  event_id text,
  source text NOT NULL DEFAULT 'live',
  signature_present boolean NOT NULL DEFAULT false,
  signature_valid boolean,
  verification_error text,
  status text NOT NULL DEFAULT 'received',
  http_status integer,
  duration_ms integer,
  payload_digest text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_delivery_logs_created_idx ON public.webhook_delivery_logs (created_at DESC);
GRANT SELECT ON public.webhook_delivery_logs TO authenticated;
GRANT ALL ON public.webhook_delivery_logs TO service_role;
ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read webhook delivery logs" ON public.webhook_delivery_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.security_scan_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.security_scan_runs(id) ON DELETE CASCADE,
  internal_id text NOT NULL,
  scanner_name text NOT NULL DEFAULT 'gradr_internal',
  level text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  entity text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_scan_findings_run_idx ON public.security_scan_findings (run_id);
GRANT SELECT ON public.security_scan_findings TO authenticated;
GRANT ALL ON public.security_scan_findings TO service_role;
ALTER TABLE public.security_scan_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read security scan findings" ON public.security_scan_findings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.security_scan_runs
  ADD COLUMN IF NOT EXISTS trigger text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS commit_ref text,
  ADD COLUMN IF NOT EXISTS totals jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS followup_stages text[] NOT NULL DEFAULT ARRAY['applied','interview']::text[];

ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS domain_proof_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS appeal_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_appeal text,
  ADD COLUMN IF NOT EXISTS fraud_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_flags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.verification_requests DROP CONSTRAINT IF EXISTS verification_requests_status_check;
ALTER TABLE public.verification_requests ADD CONSTRAINT verification_requests_status_check
  CHECK (status IN ('pending','approved','rejected','needs_more_information','appealed'));

CREATE TABLE IF NOT EXISTS public.verification_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  event text NOT NULL,
  actor_role text NOT NULL DEFAULT 'system',
  actor_id uuid,
  from_status text,
  to_status text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_request_events_request_idx
  ON public.verification_request_events (request_id, created_at DESC);
GRANT SELECT ON public.verification_request_events TO authenticated;
GRANT ALL ON public.verification_request_events TO service_role;
ALTER TABLE public.verification_request_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own verification events" ON public.verification_request_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.verification_requests vr
                  WHERE vr.id = request_id AND vr.user_id = auth.uid()));
CREATE POLICY "Admins read verification events" ON public.verification_request_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.my_verification_timeline(_request_id uuid)
RETURNS TABLE (
  id uuid, event text, actor_role text, actor_name text,
  from_status text, to_status text, notes text, metadata jsonb, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.verification_requests vr
     WHERE vr.id = _request_id AND vr.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  RETURN QUERY
  SELECT e.id, e.event, e.actor_role,
         CASE WHEN e.actor_role = 'admin' THEN 'Gradr team' ELSE p.display_name END,
         e.from_status, e.to_status, e.notes, e.metadata, e.created_at
    FROM public.verification_request_events e
    LEFT JOIN public.profiles p ON p.user_id = e.actor_id
   WHERE e.request_id = _request_id
   ORDER BY e.created_at ASC;
END $$;
REVOKE EXECUTE ON FUNCTION public.my_verification_timeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_verification_timeline(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_verification_timeline(_request_id uuid)
RETURNS TABLE (
  id uuid, event text, actor_role text, actor_name text,
  from_status text, to_status text, notes text, metadata jsonb, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  RETURN QUERY
  SELECT e.id, e.event, e.actor_role, p.display_name,
         e.from_status, e.to_status, e.notes, e.metadata, e.created_at
    FROM public.verification_request_events e
    LEFT JOIN public.profiles p ON p.user_id = e.actor_id
   WHERE e.request_id = _request_id
   ORDER BY e.created_at ASC;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_verification_timeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verification_timeline(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_verification_appeal(
  _request_id uuid,
  _message text,
  _document_path text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  req RECORD;
  event_id uuid;
BEGIN
  IF uid IS NULL OR COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF coalesce(trim(_message), '') = '' THEN
    RAISE EXCEPTION 'Please explain why we should take another look';
  END IF;

  SELECT * INTO req FROM public.verification_requests
   WHERE id = _request_id AND user_id = uid FOR UPDATE;
  IF req IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF req.status NOT IN ('rejected','needs_more_information') THEN
    RAISE EXCEPTION 'This request cannot be appealed';
  END IF;
  IF req.appeal_count >= 2 THEN
    RAISE EXCEPTION 'You have reached the appeal limit for this request';
  END IF;

  UPDATE public.verification_requests
     SET status = 'appealed',
         appeal_count = appeal_count + 1,
         latest_appeal = left(trim(_message), 2000),
         document_path = COALESCE(nullif(trim(coalesce(_document_path,'')),''), document_path),
         updated_at = now()
   WHERE id = _request_id;

  INSERT INTO public.verification_request_events
    (request_id, event, actor_role, actor_id, from_status, to_status, notes)
  VALUES (_request_id, 'appeal_submitted', 'user', uid, req.status, 'appealed', left(trim(_message), 2000))
  RETURNING id INTO event_id;

  PERFORM public.notify_admins(
    'verification_appeal',
    'Verification appeal submitted',
    'A user appealed a verification decision',
    '/admin/verifications',
    jsonb_build_object('request_id', _request_id)
  );

  RETURN event_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_verification_appeal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_appeal(uuid, text, text) TO authenticated, service_role;